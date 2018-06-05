/* globals SystemLogger, RocketChat */

import {SmartiProxy, verbs} from '../SmartiProxy';

/**
 * The SmartiAdapter handles the interaction with Smarti triggered by Rocket.Chat hooks (not by Smarti widget).
 * The SmartiAdapter encapulates the Rocket.Chat specific knowledge.
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

	static updateMapping(roomId, conversationId, timestamp) {
		// update/insert channel/conversation specific timestamp
		RocketChat.models.LivechatExternalMessage.update(
			{
				_id: roomId
			}, {
				rid: roomId,
				knowledgeProvider: 'smarti',
				conversationId,
				ts: timestamp
			}, {
				upsert: true
			}
		);
	}

	/**
	 * Returns a Smarti conversation Id for the given roomId.
	 *
	 * @param {*} roomId - the room for which the Smarti conversationId shall be retrieved
	 */
	static getConversationId(roomId) {

		SystemLogger.debug(`Retrieving conversation ID for channel: ${ roomId }`);
		const m = RocketChat.models.LivechatExternalMessage.findOneById(roomId);
		if (m && m.conversationId) {
			return m.conversationId;
		} else {
			SystemLogger.debug('Smarti - Trying legacy service to retrieve conversation ID...');
			const conversation = RocketChat.RateLimiter.limitFunction(
				SmartiProxy.propagateToSmarti, 5, 1000, {
					userId(userId) {
						return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
					}
				}
			)(verbs.get, `legacy/rocket.chat?channel_id=${ roomId }`, null, (error) => {
				// 404 is expected if no mapping exists
				if (error.response.statusCode === 404) {
					return null;
				}
			});

			if (conversation && conversation.id) {
				let timestamp = conversation.messages &&
					conversation.messages[conversation.messages.length - 1] &&
					conversation.messages[conversation.messages.length - 1].time;

				if (!timestamp) {
					timestamp = conversation.lastModified;
				}
				// Update mapping
				SmartiAdapter.updateMapping(roomId, conversation.id, timestamp);
				return conversation.id;
			} else {
				SystemLogger.debug(`Smarti - no conversation found for channel: ${ roomId }`);
				return null;
			}
		}
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
			SystemLogger.debug(`Conversation ${ conversationId } found for channel ${ message.rid }`);
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
			SystemLogger.debug('Conversation not found for channel');
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
				conversationId = conversation.id;
				SmartiAdapter._updateMapping(message.rid, conversationId);
			} else {
				Meteor.defer(()=>Meteor.call('markRoomAsUnsynced', message.rid));
			}
		}

		// request analysis results
		const analysisResult = SmartiProxy.propagateToSmarti(verbs.get, `conversation/${ conversationId }/analysis`);
		SystemLogger.debug('analysisResult:', JSON.stringify(analysisResult, null, '\t'));
		if (analysisResult) {
			RocketChat.Notifications.notifyRoom(message.rid, 'newConversationResult', analysisResult);
		}
	}

	/**
	 * Event implementation for deletion of messages
	 * @param message  - the message which has just been deleted
	 */
	static afterMessageDeleted(message) {

		const conversationId = SmartiAdapter.getConversationId(message.rid);

		if (conversationId) {
			SystemLogger.debug(`Conversation ${ conversationId } found for channel ${ message.rid }`);

			SystemLogger.debug(`Deleting message from conversation ${ conversationId } ...`);
			// add message to conversation
			SmartiProxy.propagateToSmarti(verbs.delete, `conversation/${ conversationId }/message/${ message._id }`);
		}
	}

	/**
	 * Propagates the deletion of a complete conversation to Smarti
	 * @param room - the room just deleted
	 */
	static afterRoomErased(room) { //async
		const conversationId = SmartiAdapter.getConversationId(room._id);

		if (conversationId) {
			SmartiProxy.propagateToSmarti(verbs.delete, `/conversation/${ conversationId }`);
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
}
