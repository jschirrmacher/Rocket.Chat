/* globals RocketChat, SystemLogger */

const verbs = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE'
};

function propagateToSmarti(method, path, body) {

	const URL = `${ RocketChat.settings.get('DBS_AI_Redlink_URL') }/${ path }`;

	//get the target Smarti-URL, add the client secret to the header and send the request to Smarti
	try {
		SystemLogger.debug(method, 'to', URL);
		const response = HTTP.call(method,
			URL,
			{
				//content?:string;
				// data? : any;
				// query ? : string;
				// params ? : any;
				// auth ? : string;
				// headers ? : any;
				// timeout ? : Number;
				// followRedirects ? : boolean;
				// npmRequestOptions ? : any;
				// beforeSend ? : Function
			});
		SystemLogger.debug('Successfully requested', method, 'with body', body, 'to', URL, 'got', JSON.stringify(response));

	} catch (error) {
		SystemLogger.error('Could not complete', method, 'to', URL);
		SystemLogger.debug(error);
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
	get () {
		console.log(this.urlParams.id);
	},

	post() {
		console.log(this.urlParams.id);
	}
});

