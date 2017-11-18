/* globals SystemLogger, RocketChat */

const verbs = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE'
};

function propagateToSmarti(method, path, body) {

	const SMARTI_URL = RocketChat.settings.get('DBS_AI_Smarti_URL').replace(/\/?$/, '/');
	const URL = `${ SMARTI_URL }${ path }`;

	//get the target Smarti-URL, add the client secret to the header and send the request to Smarti
	try {
		SystemLogger.debug(method, 'to', URL);
		const authHeader = {
			'X-Auth-Token': RocketChat.settings.get('DBS_AI_Smarti_Auth_Token'),
			'Content-Type': 'application/json'
		};
		return HTTP.call(method, URL, { data: body, headers: authHeader });
	} catch (error) {
		SystemLogger.error('Could not complete', method, 'to', URL);
		SystemLogger.debug(error);
		return false;
	}
}

/*
 * These routes provides a proxy-mechanism for Smarti
 * Motivation: Smarti requires a client specific token to access and interact with its conversations.
 * This includes the actual retrieval of historic conversations, but also the interactions with the query templates
 * such as deleting or confirming a particular token
 */
RocketChat.API.v1.addRoute('assistify/smarti/conversation', {authRequired: true}, {
	post() {
		// Sending messages is limited to five per second, see packages/rocketchat-lib/server/methods/sendMessage.js
		// copy this limit to the number of analysis-triggers
		return RocketChat.RateLimiter.limitFunction(propagateToSmarti(verbs.post, 'conversation', this.bodyParams), 5, 1000, {
			userId(userId) {
				return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
			}
		});
	}
});

RocketChat.API.v1.addRoute('assistify/smarti/conversation/:_id', {authRequired: true}, {
	get() {
		if (!RocketChat.authz.hasPermission(this.userId, 'send-many-messages')) {
			return RocketChat.API.v1.unauthorized();
		}
		try {
			check(this.urlParams, {
				_id: String
			});
			const response = propagateToSmarti(verbs.get, `conversation/${ this.urlParams._id }`, this.bodyParams);
			return RocketChat.API.v1.success(response.data);
		} catch (e) {
			return RocketChat.API.v1.failure(e.error);
		}
	},

	post() {
		SystemLogger.debug(this.urlParams.id);
	}
});

RocketChat.API.v1.addRoute('assistify/smarti/conversation/:_id/template/:_index/:_queryBuilder', {authRequired: true}, {
	get() {
		if (!RocketChat.authz.hasPermission(this.userId, 'send-many-messages')) {
			return RocketChat.API.v1.unauthorized();
		}
		try {
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
			const reqURL = `conversation/${ this.urlParams._id }/template/${ this.urlParams._index }/${ this.urlParams._queryBuilder }${ queryP }`;
			const response = propagateToSmarti(verbs.get, reqURL, this.bodyParams);
			return RocketChat.API.v1.success(response.data);
		} catch (e) {
			return RocketChat.API.v1.failure(e.error);
		}
	}
});

