/* globals SystemLogger, RocketChat */

/** The possible HTTP methods provided by the Smarti adapter. */
const verbs = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE'
};

/**
 * The Smarti adapter handles all communication between the Rocket.Chat Server instance and Smarti.
 * This is the central point for accessing Smarti.
 * Do not send direct HTTP(S) requests from anywhere else.
 */
class SmartiAdapter {

	/**
	 * instantiates the Smarti adapter with the given settings/properties
	 *
	 * @param adapterProps the properties, read from the Assistify settings
	 */
	constructor(adapterProps) {

		this.properties = adapterProps;
	}

	/**
	 * Propagates requests to Smarti.
	 * Make sure all requests to Smarti are using this function.
	 *
	 * @param method the HTTP method toi use
	 * @param path the path to call
	 * @param body the payload to pass (optional)
	 *
	 * @returns {null|*|JSON|HttpResponse}
	 */
	propagateToSmarti(method, path, body) {

		const header = {
			'X-Auth-Token': this.properties.smartiAuthToken,
			'Content-Type': 'application/json; charset=utf-8'
		};
		try {
			const response = HTTP.call(method, `${ this.properties.smartiUrl }${ path }`, {data: body, headers: header});
			return RocketChat.API.v1.success(response.data);
		} catch (error) {
			SystemLogger.error('Could not complete', method, 'to', URL);
			SystemLogger.debug(error);
			return RocketChat.API.v1.failure(error);
		}
	}

	/**
	 * Event implementation that posts the message to Smarti.
	 *
	 * @param message the message to send
	 *
	 * @returns {*}
	 */
	onMessage(message) {

		//TODO is this always a new one, what about update
		const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(message.rid);
		const supportArea = helpRequest ? helpRequest.supportArea : undefined;
		const requestBody = {
			webhook_url: this.properties.rcWebhookUrl,
			message_id: message._id,
			channel_id: message.rid,
			user_id: message.u._id,
			// username: message.u.username,
			text: message.msg,
			timestamp: message.ts,
			origin: message.origin,
			support_area: supportArea
		};
		return RocketChat.RateLimiter.limitFunction(
			this.propagateToSmarti.bind(this), 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		)(verbs.post, `rocket/${ this.properties.smartiKnowledgeDomain }`, requestBody);
	}

	/**
	 * Event implementation that publishes the conversation in Smarti.
	 *
	 * @param room - the room to close/publish
	 *
	 * @returns {*}
	 */
	onClose(room) { //async

		// get conversation id
		const m = RocketChat.models.LivechatExternalMessage.findOneById(room._id);
		if (m) {
			return RocketChat.RateLimiter.limitFunction(
				this.propagateToSmarti.bind(this), 5, 1000, {
					userId(userId) {
						return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
					}
				}
			)(verbs.post, `conversation/${ m.conversationId }/publish`);
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
	}

	/**
	 * Returns the analysed conversation by id (used by Smarti widget)
	 *
	 * @param conversationId - the conversation to retrieve
	 *
	 * @returns {*} the analysed conversation
	 */
	getConversation(conversationId) {
		return RocketChat.RateLimiter.limitFunction(
			this.propagateToSmarti.bind(this), 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		)(verbs.get, `conversation/${ conversationId }`);
	}

	/**
	 * Returns the query builder results for the given conversation (used by Smarti widget)
	 *
	 * @param conversationId - the conversation id
	 * @param templateIndex - the index of the template to get the results for
	 * @param creator - the creator providing the suggestions
	 * @param start - the offset of the suggestion results (pagination)
	 *
	 * @returns {*} the suggestions
	 */
	getSmartiQueryBuilderResult(conversationId, templateIndex, creator, start) {

		return RocketChat.RateLimiter.limitFunction(
			this.propagateToSmarti.bind(this), 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		)(verbs.get, `conversation/${ conversationId }/template/${ templateIndex }/${ creator }?start=${ start }`);
	}

	/**
	 * Searches for conversations within the given client
	 *
	 * @param clientId the id of the client to search conversations for
	 * @param queryParams the search query parameters
	 *
	 * @returns {*} the serach result
	 */
	searchConversation(clientId, queryParams) {
		return RocketChat.RateLimiter.limitFunction(
			this.propagateToSmarti.bind(this), 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		)(verbs.get, `rocket/${ clientId }/search${ queryParams }`);
	}
}

/**
 * The factory to create a Smarti adapter singleton
 */
export class SmartiAdapterFactory {

	/**
	 *  Refreshes the adapter instances on change of the configuration
	 *
	 *  TODO: validate it works
	 */
	constructor() {

		this.singleton = undefined;
		const factory = this;

		RocketChat.settings.get('Assistify_AI_Source', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Base_URL', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Domain', () => {
			factory.singleton = null;
		});
	}

	/**
	 * Returns the SmartiAdapter singleton
	 *
	 * @param reload - to recreate the singleton object
	 *
	 * @returns {null|undefined|*|SmartiAdapter}
	 */
	static getInstance(reload) {

		if (!this.singleton || reload) {

			const adapterProps = {
				rcUrl: '',
				rcWebhookToken: '',
				rcWebhookUrl: '',
				smartiUrl: '',
				smartiAuthToken: '',
				smartiKnowledgeDomain: ''
			};

			// Rocket.Chat webhook
			adapterProps.rcUrl = RocketChat.settings.get('Site_Url').replace(/\/?$/, '/');
			adapterProps.rcWebhookToken = RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token');
			adapterProps.rcWebhookUrl = `${ adapterProps.rcUrl }api/v1/smarti.result/${ adapterProps.rcWebhookToken }`;

			// Smarti connection
			const smartiUrl = RocketChat.settings.get('Assistify_AI_Smarti_Base_URL');
			if (smartiUrl) {
				adapterProps.smartiUrl = smartiUrl.replace(/\/?$/, '/');
			}
			adapterProps.smartiAuthToken = RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token');
			adapterProps.smartiKnowledgeDomain = RocketChat.settings.get('Assistify_AI_Smarti_Domain');

			this.singleton = new SmartiAdapter(adapterProps);
			return this.singleton;

		} else {

			return this.singleton;
		}
	}
}

/**
 * This methods are made available to be accessed via DDP.
 * They are called by the Smarti widget.
 */
Meteor.methods({

	/**
	 * Returns the conversation id via real-time api
	 *
	 * @param rid the roomId to get the last sent message from
	 *
	 * @returns {*} the last message, including the rid
	 */
	getLastSmartiResult(rid) {

		//Todo: check if the user is allowed to get this results!
		SystemLogger.debug('Smarti - last smarti result requested:', JSON.stringify(rid, '', 2));
		SystemLogger.debug('Smarti - last message:', JSON.stringify(RocketChat.models.LivechatExternalMessage.findOneById(rid), '', 2));
		return RocketChat.models.LivechatExternalMessage.findOneById(rid);
	},


	/**
	 * Delegates to the Smarti adapter implementation
	 */
	getSmartiConversation(conversationId) {

		return SmartiAdapterFactory.getInstance().getConversation(conversationId);
	},


	/**
	 * Delegates to the Smarti adapter implementation
	 */
	getSmartiQueryBuilderResult(conversationId, templateIndex, creator, start) {

		return SmartiAdapterFactory.getInstance().getSmartiQueryBuilderResult(conversationId, templateIndex, creator, start);
	}
});

/**
 * Add a proxy to the smarti conversation search.
 * This endpoint is used by chatpal search.
 */
RocketChat.API.v1.addRoute('smarti.search/:_clientId', { authRequired: false }, {

	get() {

		check(this.urlParams, {
			_clientId: String
		});

		let queryParams = '?';
		for (const key in this.queryParams) {
			if (this.queryParams.hasOwnProperty(key)) {
				queryParams += `&${ key }=${ this.queryParams[key] }`;
			}
		}
		return SmartiAdapterFactory.getInstance().searchConversation(this.urlParams._clientId, queryParams);
	}
});

/**
 * Add an incoming webhook to receive answers from Smarti.
 * This allows asynchronous callback from Smarti, when analyzing the conversation has finished.
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
