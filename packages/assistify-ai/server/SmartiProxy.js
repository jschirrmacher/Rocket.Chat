/* globals SystemLogger, RocketChat */

import { SmartiAdapterFactory } from './lib/SmartiAdapter';

export const verbs = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE'
};

/**
 * Propagates requests to Smarti.
 * Make sure all requests to Smarti are using this function.
 *
 * @param method
 * @param path
 * @param body
 *
 * @returns {*}
 */
export function propagateToSmarti(method, path, body) {

	const adapterProperties = SmartiAdapterFactory.getInstance().properties;
	const header = {
		'X-Auth-Token': adapterProperties.smartiAuthToken,
		'Content-Type': 'application/json; charset=utf-8'
	};
	try {
		const response = HTTP.call(method, `${ adapterProperties.smartiUrl }${ path }`, {data: body, headers: header});
		return RocketChat.API.v1.success(response.data);
	} catch (error) {
		SystemLogger.error('Could not complete', method, 'to', URL);
		SystemLogger.debug(error);
		return RocketChat.API.v1.failure(error);
	}
}

/**
 * add proxy to get a conversation by id from Smarti
 */
RocketChat.API.v1.addRoute('assistify/smarti/conversation/:_id', {authRequired: true}, {
	get() {
		check(this.urlParams, {
			_id: String
		});
		const propagate = RocketChat.RateLimiter.limitFunction(
			propagateToSmarti, 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		);
		return propagate(verbs.get, `conversation/${ this.urlParams._id }`);
	}
});

/**
 * add proxy to get query builder results from Smarti
 */
RocketChat.API.v1.addRoute('assistify/smarti/conversation/:_id/template/:_index/:_queryBuilder', {authRequired: true}, {
	get() {
		check(this.urlParams, {
			_id: String,
			_index: String,
			_queryBuilder: String
		});
		let queryP = '?';
		for (const key in this.queryParams) {
			if (this.queryParams.hasOwnProperty(key)) {
				queryP += `&${ key }=${ this.queryParams[key] }`;
			}
		}
		const propagate = RocketChat.RateLimiter.limitFunction(
			propagateToSmarti, 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		);
		return propagate(verbs.get, `conversation/${ this.urlParams._id }/template/${ this.urlParams._index }/${ this.urlParams._queryBuilder }${ queryP }`);
	}
});

/**
 * add incoming webhook to receive answers from Smarti
 */
RocketChat.API.v1.addRoute('smarti.result/:_token', {authRequired: false}, {
	post() {
		check(this.bodyParams, Match.ObjectIncluding({
			conversationId: String,
			channelId: String
		}));

		//verify token
		const rcWebhookToken = SmartiAdapterFactory.getInstance().properties.rcWebhookToken;
		if (this.urlParams._token && this.urlParams._token === rcWebhookToken) {

			SystemLogger.debug('Smarti - got conversation result:', JSON.stringify(this.bodyParams, null, 2));
			RocketChat.models.LivechatExternalMessage.update(
				{
					_id: this.bodyParams.channelId
				}, {
					rid: this.bodyParams.channelId,
					knowledgeProvider: 'smarti',
					conversationId: this.bodyParams.conversationId,
					token: this.bodyParams.token,
					ts: new Date()
				}, {
					upsert: true
				}
			);

			const m = RocketChat.models.LivechatExternalMessage.findOneById(this.bodyParams.channelId);
			RocketChat.Notifications.notifyRoom(this.bodyParams.channelId, 'newConversationResult', m);
			return RocketChat.API.v1.success();
		} else {
			return RocketChat.API.v1.unauthorized({msg: 'token not valid'});
		}
	}
});
