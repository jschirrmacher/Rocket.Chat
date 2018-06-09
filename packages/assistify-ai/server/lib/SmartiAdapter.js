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

		const conversationId = SmartiAdapter.getConversationId(message.rid);
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
				Meteor.defer(()=>Meteor.call('markMessageAsSynced', message._id));
			} else {
				Meteor.defer(()=>Meteor.call('markRoomAsUnsynced', message.rid));
			}
		} else {
			// create conversation
			SystemLogger.debug(`Conversation not found for room ${ message.rid }, create a new conversation.`);
			const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(message.rid);
			const room = RocketChat.models.Rooms.findOneById(message.rid);

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
			const conversation = SmartiProxy.propagateToSmarti(verbs.post, 'conversation', requestBodyConversation);
			if (conversation && conversation.id) {
				SystemLogger.debug('New conversation created and message will be synced now');
				Meteor.defer(()=>Meteor.call('markMessageAsSynced', message._id));
				SmartiAdapter._updateMapping(message.rid, conversation.id);
			} else {
				Meteor.defer(()=>Meteor.call('markRoomAsUnsynced', message.rid));
			}
		}

		// request analysis results
		SystemLogger.debug(`Smarti - onMmessage -> Get analysis asynch (callback=${ SmartiAdapter.rocketWebhookUrl }) for conversation ${ conversationId } and romm ${ message.rid }`);
		SmartiProxy.propagateToSmarti(verbs.get, `conversation/${ conversationId }/analysis?callback=${ SmartiAdapter.rocketWebhookUrl }`);
	}

	/**
	 * Event implementation for deletion of messages.
	 *
	 * @param message - the message which has just been deleted
	 */
	static afterMessageDeleted(message) {

		const conversationId = SmartiAdapter.getConversationId(message.rid);
		if (conversationId) {
			SystemLogger.debug(`Conversation ${ conversationId } found for channel ${ message.rid }`);
			SystemLogger.debug(`Deleting message from conversation ${ conversationId } ...`);
			SmartiProxy.propagateToSmarti(verbs.delete, `conversation/${ conversationId }/message/${ message._id }`);
			SmartiAdapter._updateMapping(message.rid, conversationId);
		}

		// request analysis results
		SystemLogger.debug(`Smarti - afterMessageDeleted -> Get analysis asynch (callback=${ SmartiAdapter.rocketWebhookUrl }) for conversation ${ conversationId } and romm ${ message.rid }`);
		SmartiProxy.propagateToSmarti(verbs.get, `conversation/${ conversationId }/analysis?callback=${ SmartiAdapter.rocketWebhookUrl }`); // asynch
	}

	/**
	 * Propagates the deletion of a complete conversation to Smarti.
	 *
	 * @param room - the room just deleted
	 */
	static afterRoomErased(room) { //async

		const conversationId = SmartiAdapter.getConversationId(room._id);
		if (conversationId) {
			SmartiProxy.propagateToSmarti(verbs.delete, `/conversation/${ conversationId }`);
			SmartiAdapter._removeMapping(room.id);
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
	}

	/**
	 * Event implementation that publishes the conversation in Smarti.
	 *
	 * @param room - the room to close
	 *
	 * @returns {*}
	 */
	static onClose(room) { //async
		const conversationId = SmartiAdapter.getConversationId(room._id);

		if (conversationId) {
			const res = SmartiProxy.propagateToSmarti(verbs.put, `/conversation/${ conversationId }/meta.status`, 'Complete');
			if (!res) {
				Meteor.defer(()=>Meteor.call('markRoomAsUnsynced', room._id));
			}
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
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
			roomId = RocketChat.models.LivechatExternalMessage.findOneByConversationId(conversationId).rid;
		}
		SystemLogger.debug(`Smarti analysis complete: update cache and notify room ${ roomId } for conversation: ${ conversationId }`, JSON.stringify(analysisResult, null, 2));
		SmartiAdapter._updateMapping(roomId, conversationId);
		RocketChat.Notifications.notifyRoom(roomId, 'newConversationResult', analysisResult);
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
		SystemLogger.info(`Retrieving conversation ID for channel: ${ roomId }`);
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
