/* globals SystemLogger, RocketChat */

import {SmartiProxy, verbs} from '../SmartiProxy';

/**
 * The SmartiAdpater can be understood as an interface for all interaction with Smarti triggered by Rocket.Chat server.
 * The SmartiAdapter sould not expose any methods that can directly be called by the client.
 * This adapter has no state, as all settings are fully buffered. Thus, the complete class is static.
 */
export class SmartiAdapter {

	static get rocketWebhookUrl() {
		let rocketUrl = RocketChat.settings.get('Site_Url');
		rocketUrl = rocketUrl ? rocketUrl.replace(/\/?$/, '/') : rocketUrl;
		return `${ rocketUrl }api/v1/smarti.result/${ RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token') }`;
	}

	static get smartiKnowledgeDomain() {
		return RocketChat.settings.get('Assistify_AI_Smarti_Domain');
	}

	/**
	 * Event implementation that posts the message to Smarti.
	 *
	 * @param {object} message: {
	 *   _id: STRING,
	 *   rid: STRING,
	 *   u: {*},
	 *   msg: STRING,
	 *   ts: NUMBER,
	 *   origin: STRING
	 * }
	 *
	 * @returns {*}
	 */
	static onMessage(message) {

		const requestBodyMessage = {
			'id': message._id,
			'time': message.ts,
			'origin': 'User', //user.type,
			'content': message.msg,
			'user': {
				'id': message.u._id
			},
			'metadata': {}
			//,"private" : false
		};

		if (message.origin === 'smartiWidget') {
			requestBodyMessage.metadata.skipAnalysis = true;
		}

		SystemLogger.debug('RocketChatMessage:', message);
		SystemLogger.debug('Message:', requestBodyMessage);

		let conversationId = SmartiAdapter.getConversationId(message.rid);
		if (conversationId) {
			// update conversation
			SystemLogger.debug(`Conversation ${ conversationId } found for channel ${ message.rid }, perform conversation update.`);
			let request_result;
			if (message.editedAt) {
				SystemLogger.debug('Trying to update existing message...');
				// update existing message
				request_result = SmartiProxy.propagateToSmarti(verbs.put, `conversation/${ conversationId }/message/${ requestBodyMessage.id }`, requestBodyMessage, (error) => {
					// 404 is expected if message doesn't exist
					if (!error.response || error.response.statusCode === 404) {
						SystemLogger.debug('Message not found!');
						SystemLogger.debug('Adding new message to conversation...');
						request_result = SmartiProxy.propagateToSmarti(verbs.post, `conversation/${ conversationId }/message`, requestBodyMessage);
					}
				});
			} else {
				SystemLogger.debug('Adding new message to conversation...');
				request_result = SmartiProxy.propagateToSmarti(verbs.post, `conversation/${ conversationId }/message`, requestBodyMessage);
			}
			if (request_result) {
				SystemLogger.debug('Conversation found and message will be synced now');
				Meteor.defer(() => SmartiAdapter._markMessageAsSynced(message._id));
			} else {
				Meteor.defer(() => SmartiAdapter._markRoomAsUnsynced(message.rid));
			}
		} else {
			// create conversation
			SystemLogger.debug(`Conversation not found for room ${ message.rid }, create a new conversation.`);

			const room = RocketChat.models.Rooms.findOneById(message.rid);
			const supportArea = this._getSupportArea(room);
			const requestBodyConversation = {
				'meta': {
					'support_area': [supportArea],
					'channel_id': [message.rid]
				},
				'user': {
					'id': room.u ? room.u._id : room.v._id
				},
				'messages': [requestBodyMessage],
				'context': {
					'contextType': 'rocket.chat'
				}
			};

			SystemLogger.debug('Creating conversation:', JSON.stringify(requestBodyConversation, null, '\t'));

			// create conversation, send message along and request analysis
			const conversation = SmartiProxy.propagateToSmarti(verbs.post, 'conversation', requestBodyConversation, (error) => {
				SystemLogger.error(`Smarti - unexpected server error: ${ JSON.stringify(error, null, 2) } occured when creating a new conversation: ${ JSON.stringify(requestBodyConversation, null, 2) }`);
			});
			if (conversation && conversation.id) {
				conversationId = conversation.id;
				SystemLogger.debug('New conversation created and message will be synced now');
				Meteor.defer(() => SmartiAdapter._markMessageAsSynced(message._id));
			} else {
				Meteor.defer(() => SmartiAdapter._markRoomAsUnsynced(message.rid));
			}
		}

		// conversation updated or created -> get the results
		if (conversationId) {
			SmartiAdapter._getAnalysisResult(message.rid, conversationId);
		} else {
			SystemLogger.error(`Smarti - updating/creating conversation faild for message [ id: ${ message._id } ] in room [ id: ${ message.rid } ]`);
		}
	}

	/**
	 * Event implementation for deletion of messages.
	 *
	 * @param message - the message which has just been deleted
	 */
	static afterMessageDeleted(message) {

		const conversationId = SmartiAdapter.getConversationId(message.rid);
		if (conversationId) {
			SystemLogger.debug(`Smarti - Deleting message ${ message.rid } from conversation ${ conversationId }.`);
			SmartiProxy.propagateToSmarti(verbs.delete, `conversation/${ conversationId }/message/${ message._id }`);
			SmartiAdapter._getAnalysisResult(message.rid, conversationId);
		} else {
			SystemLogger.error(`Smarti - deleting message from conversation faild after delete message [ id: ${ message._id } ] from room [ id: ${ message.rid } ]`);
		}
	}

	/**
	 * Propagates the deletion of a complete conversation to Smarti.
	 *
	 * @param room - the room just deleted
	 */
	static afterRoomErased(room) {

		const conversationId = SmartiAdapter.getConversationId(room._id);
		if (conversationId) {
			SystemLogger.debug(`Smarti - Deleting conversation ${ conversationId } after room ${ room._id  } erased.`);
			SmartiProxy.propagateToSmarti(verbs.delete, `/conversation/${ conversationId }`);
			SmartiAdapter._removeMapping(room.id);
		} else {
			SystemLogger.error(`Smarti - deleting conversation faild after erasing room [ ${ room._id } ]`);
		}
	}

	/**
	 * Event implementation that publishes the conversation in Smarti.
	 *
	 * @param room - the room to close
	 *
	 * @returns {*}
	 */
	static onClose(room) {

		const conversationId = SmartiAdapter.getConversationId(room._id);

		if (conversationId) {
			const res = SmartiProxy.propagateToSmarti(verbs.put, `/conversation/${ conversationId }/meta.status`, 'Complete');
			if (!res) {
				Meteor.defer(() => SmartiAdapter._markRoomAsUnsynced(room._id));
			}
		} else {
			SystemLogger.error(`Smarti - setting conversation to complete faild when closing room [ ${ room._id } ]`);
		}
	}

	/**
	 * Returns the cached conversationId from the analyzed conversations cache (LivechatExternalMessage).
	 * If the conversation analysis is not cached it will be retieved from Smarti.
	 * Finally the mapping cache (roomID <-> smartiResult) is updated.
	 *
	 * @param {*} roomId - the room for which the Smarti conversationId shall be retrieved
	 */
	static getConversationId(roomId) {

		let conversationId = null;
		SystemLogger.debug(`Retrieving conversation ID for channel: ${ roomId }`);
		const cachedSmartiResult = RocketChat.models.LivechatExternalMessage.findOneById(roomId);
		if (cachedSmartiResult && cachedSmartiResult.conversationId) {
			// cached conversation found
			conversationId = cachedSmartiResult.conversationId;
		} else {
			// uncached conversation
			SystemLogger.debug(`No cached Smarti conversation found for roomId: ${ roomId }, `);
			SystemLogger.debug('Trying Smarti legacy service to retrieve conversation...');
			const conversation = SmartiProxy.propagateToSmarti(verbs.get, `legacy/rocket.chat?channel_id=${ roomId }`, null, (error) => {
				// 404 is expected if no mapping exists in Smarti
				if (error.response.statusCode === 404) {
					SystemLogger.warn(`No Smarti conversationId found (Server Error 404) for room: ${ roomId }`);
				} else {
					// some other error occurred
					SystemLogger.error(`Unexpected error while retrieving Smarti conversationId for room: ${ roomId }`, error.response);
				}
			});
			if (conversation && conversation.id) {
				// uncached conversation found in Smarti, update mapping ...
				conversationId = conversation.id;
				SmartiAdapter._updateMapping(roomId, conversationId);
			} else {
				SystemLogger.debug(`Smarti - no conversation found for room: ${ roomId }`);
			}
		}
		return conversationId;
	}

	/**
	 * At any point in time when the anylsis for a room has been done (onClose, onMessage), this analysisCompleted
	 * Updates the mapping and notifies the room, in order to reload the Smarti result representation
	 *
	 * @param roomId - the RC room Id
	 * @param conversationId  - the Smarti conversation Id
	 * @param analysisResult - the analysis result from Smarti
	 */
	static analysisCompleted(roomId, conversationId, analysisResult) {

		if (roomId === null) {
			const conversationCacheEntry = RocketChat.models.LivechatExternalMessage.findOneByConversationId(conversationId);
			if (conversationCacheEntry && conversationCacheEntry.rid) {
				roomId = conversationCacheEntry.rid;
			} else {
				SystemLogger.error(`Smarti - no room found for conversation [ ${ conversationId } ] unable to notify room.`);
			}
		}
		SystemLogger.debug('Smarti - retieved analysis result =', JSON.stringify(analysisResult, null, 2));
		SystemLogger.debug(`Smarti - analysis complete -> update cache and notify room [ ${ roomId } ] for conversation [ ${ conversationId } ]`);
		SmartiAdapter._updateMapping(roomId, conversationId);
		RocketChat.Notifications.notifyRoom(roomId, 'newConversationResult', analysisResult);
	}

	static _getAnalysisResult(roomId, conversationId) {

		// conversation updated or created => request analysis results
		SmartiAdapter._updateMapping(roomId, conversationId);
		SystemLogger.debug(`Smarti - conversation updated or created -> get analysis result asynch [ callback=${ SmartiAdapter.rocketWebhookUrl } ] for conversation: ${ conversationId } and room: ${ roomId }`);
		SmartiProxy.propagateToSmarti(verbs.get, `conversation/${ conversationId }/analysis?callback=${ SmartiAdapter.rocketWebhookUrl }`); // asynch
	}

	static resync(ignoreSynchFlag) {
		SystemLogger.info('Smarti resync triggered');

		if (ignoreSynchFlag) {
			RocketChat.models.LivechatExternalMessage.clear();
		}

		let query = {};
		if (!ignoreSynchFlag || ignoreSynchFlag !== true) {
			query = {$or: [{outOfSync: true}, {outOfSync: {$exists: false}}]};
		}

		query.t = 'r';
		const requests = RocketChat.models.Rooms.model.find(query).fetch();
		SystemLogger.info('Number of Requests to sync: ', requests.length);
		for (let i = 0; i < requests.length; i++) {
			Meteor.defer(() => SmartiAdapter._tryResync(requests[i]._id, ignoreSynchFlag));
		}

		query.t = 'e';
		const topics = RocketChat.models.Rooms.model.find(query).fetch();
		SystemLogger.info('Number of Topics to sync: ', topics.length);
		for (let i = 0; i < topics.length; i++) {
			Meteor.defer(() => SmartiAdapter._tryResync(topics[i]._id, ignoreSynchFlag));
		}

		return {
			message: 'sync-triggered-successfully'
		};
	}

	static _tryResync(rid, ignoreSynchFlag) {
		SystemLogger.debug('Sync all unsynced messages in room: ', rid);
		const room = RocketChat.models.Rooms.findOneById(rid);
		const messageDB = RocketChat.models.Messages;
		const unsync = messageDB.find({ lastSync: { $exists: false }, rid, t: { $exists: false } }).fetch();
		if (!ignoreSynchFlag || ignoreSynchFlag !== true) {
			if (unsync.length === 0 && !room.outOfSync) {
				SystemLogger.debug('Room is already in sync');
				return true;
			} else {
				SystemLogger.debug('Messages out of sync: ', unsync.length);
			}
		}

		SmartiProxy.propagateToSmarti(verbs.get, 'system/info', null, (response) => {
			// if Smarti is not available stop
			if (response.statusCode !== 200) {
				throw new Meteor.Error('Smarti not reachable');
			}
		});

		const conversationId = SmartiAdapter.getConversationId(rid);
		if (conversationId) {
			SystemLogger.debug(`Conversation found ${ conversationId } - delete and create new conversation`);
			SmartiProxy.propagateToSmarti(verbs.delete, `conversation/${ conversationId }`, null);
		}

		// create the conversation completly new (this will also heal defected conversations)
		const supportArea = SmartiAdapter._getSupportArea(room);
		const conversation = {
			'meta': {
				'support_area': [supportArea],
				'channel_id': [rid]
			},
			'user': {
				'id': room.u._id
			},
			'messages': [],
			'context': {
				'contextType': 'rocket.chat'
			}
		};
		let messages;
		if (room.closedAt) {
			messages = messageDB.find({rid, ts: {$lt: room.closedAt}}, { sort: { ts: 1 } }).fetch();
			conversation.meta.status = 'Complete';
		} else {
			messages = messageDB.find({rid}, { sort: { ts: 1 } }).fetch();
		}

		conversation.messages = [];
		for (let i=0; i < messages.length; i++) {
			const newMessage = {
				'id': messages[i]._id,
				'time': messages[i].ts,
				'origin': 'User', //user.type,
				'content': messages[i].msg,
				'user': {
					'id': messages[i].u._id
				}
			};
			conversation.messages.push(newMessage);
		}

		// post the new conversation to Smarti
		const newSmartiConversation = SmartiProxy.propagateToSmarti(verbs.post, 'conversation', conversation);
		// get the analysis result
		const analysisResult = SmartiProxy.propagateToSmarti(verbs.get, `conversation/${ newSmartiConversation.id }/analysis`);
		SystemLogger.debug(`Smarti - New conversation with Id ${ newSmartiConversation.id } analyzed.`);
		if (analysisResult) {
			SystemLogger.debug('analysisResult:', JSON.stringify(analysisResult, null, '\t'));
			SmartiAdapter.analysisCompleted(rid, newSmartiConversation.id, analysisResult);
		}
		SystemLogger.debug(`Smarti analysisCompleted finished for conversation ${ newSmartiConversation.id }`);

		for (let i=0; i < messages.length; i++) {
			Meteor.defer(() => SmartiAdapter._markMessageAsSynced(messages[i]._id));
		}
		RocketChat.models.Rooms.model.update(
			{_id: rid},
			{
				$set: {
					outOfSync: false
				}
			});
		SystemLogger.debug('Room Id: ', rid, ' is in sync now');
		return true;
	}

	static _getSupportArea(room) {
		const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(room._id);
		// The "support_area" in Smarti is an optional property. A historic conversation belonging to the same support_are increases relevance
		let supportArea = room.parentRoomId || room.topic || room.expertise;
		if (!supportArea) {
			if (room.t === '') {
				supportArea = 'livechat';
			} else if (helpRequest && helpRequest.supportArea) {
				supportArea = helpRequest.supportArea;
			} else {
				supportArea = room.name;
			}
		}

		SystemLogger.debug('HelpRequest:', helpRequest);
		SystemLogger.debug('Room:', room);
		return supportArea;
	}

	static _markMessageAsSynced(messageId) {
		const messageDB = RocketChat.models.Messages;
		const message = messageDB.findOneById(messageId);
		const lastUpdate = message ? message._updatedAt : 0;
		if (lastUpdate) {
			messageDB.model.update(
				{_id: messageId},
				{
					$set: {
						lastSync: lastUpdate
					}
				});
			SystemLogger.debug('Message Id: ', messageId, ' has been synced');
		} else {
			SystemLogger.debug('Message Id: ', messageId, ' can not be synced');
		}
	}

	static _markRoomAsUnsynced(rid) {
		RocketChat.models.Rooms.model.update(
			{_id: rid},
			{
				$set: {
					outOfSync: true
				}
			});
		SystemLogger.debug('Room Id: ', rid, ' is out of sync');
	}

	static _removeMapping(roomId) {

		RocketChat.models.LivechatExternalMessage.remove({ _id: roomId });
	}

	static _updateMapping(roomId, conversationId) {

		if (!roomId && !conversationId) {
			SystemLogger.error('Smarti - Unable to update mapping roomId or conversationId undefined');
			throw new Meteor.Error('Smarti - Unable to update mapping roomId or conversationId undefined');
		}

		RocketChat.models.LivechatExternalMessage.update(
			{
				_id: roomId
			}, {
				rid: roomId,
				knowledgeProvider: 'smarti',
				conversationId
			}, {
				upsert: true
			}
		);
	}
}
