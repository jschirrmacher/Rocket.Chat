/* globals RocketChat */

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
		this.logger.debug(method, 'to', URL);
		const authheader = {
			'X-Auth-Token': RocketChat.settings.get('DBS_AI_Smarti_Auth_Token'),
			'Content-Type': 'application/json'
		};
		return HTTP.call(method, URL, { data: body, headers: authheader });
	} catch (error) {
		this.logger.error('Could not complete', method, 'to', URL);
		this.logger.debug(error);
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

RocketChat.API.v1.addRoute('assistify/smarti/conversation/:id', {authRequired: true}, {
	get() {
		const response = propagateToSmarti(verbs.get, `conversation/${ this.urlParams.id }`, this.bodyParams);
		return RocketChat.API.v1.success(response.data);
	},

	post() {
		this.logger.debug(this.urlParams.id);
	}
});

RocketChat.API.v1.addRoute('assistify/smarti/conversation/:_id/template/:_index/:_queryBuilder', {authRequired: false}, {
	get() {
		let queryP = '?';
		for (const key in this.queryParams) {
			if (this.queryParams.hasOwnProperty(key)) {
				queryP += `&${ key }=${ this.queryParams[key] }`;
			}
		}
		const reqURL = `conversation/${ this.urlParams._id }/template/${ this.urlParams._index }/${ this.urlParams._queryBuilder }${ queryP }`;
		const response = propagateToSmarti(verbs.get, reqURL, this.bodyParams);
		return RocketChat.API.v1.success(response.data);
	}
});

