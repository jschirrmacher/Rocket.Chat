/* globals SystemLogger, RocketChat */

import {SmartiProxy, verbs} from '../SmartiProxy';
import {SmartiAdapter} from '../lib/SmartiAdapter';

Meteor.methods({

	triggerResync() {
		if (!RocketChat.authz.hasRole(Meteor.userId(), 'admin')) {
			throw new Meteor.Error(`SmartiResynch - triggerResync not permitted for user [ ${ Meteor.userId() } ]`);
		}
		return SmartiAdapter.resynch(false);
	},

	triggerFullResync() {
		if (!RocketChat.authz.hasRole(Meteor.userId(), 'admin')) {
			throw new Meteor.Error(`SmartiResynch - triggerResync not permitted for user [ ${ Meteor.userId() } ]`);
		}
		// Todo: Should this method directly access the LiveChatExternalMessage collection?
		RocketChat.models.LivechatExternalMessage.clear();
		return SmartiAdapter.resynch(true);
	},

	markMessageAsSynced(messageId) {
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
	},

	markRoomAsUnsynced(rid) {
		RocketChat.models.Rooms.model.update(
			{_id: rid},
			{
				$set: {
					outOfSync: true
				}
			});
		SystemLogger.debug('Room Id: ', rid, ' is out of sync');
	},

	tryResync(rid, ignoreSynchFlag) {
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
				return;
			}
		});

		const conversationId = SmartiAdapter.getConversationId(rid);
		let conversation = {};

		if (!conversationId) {
			SystemLogger.debug('Conversation not found - create new conversation');
			const supportArea = room.parentRoomId || room.topic || room.expertise;
			conversation = {
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
		} else {
			SmartiProxy.propagateToSmarti(verbs.delete, `conversation/${ conversationId }`, null);
			SystemLogger.debug('Deleted old conversation - ready to sync');
		}

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
			Meteor.defer(()=>Meteor.call('markMessageAsSynced', messages[i]._id));
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
});

/**
 * Limit exposed methods to prevent DOS.
 */

RocketChat.RateLimiter.limitMethod('triggerResync', 1, 2000, {
	userId() { return true; }
});
RocketChat.RateLimiter.limitMethod('triggerFullResync', 1, 2000, {
	userId() { return true; }
});

RocketChat.RateLimiter.limitMethod('tryResync', 5, 1000, {
	userId(userId) {
		return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
	}
});
RocketChat.RateLimiter.limitMethod('markMessageAsSynced', 5, 1000, {
	userId(userId) {
		return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
	}
});
RocketChat.RateLimiter.limitMethod('markRoomAsUnsynced', 5, 1000, {
	userId(userId) {
		return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
	}
});
