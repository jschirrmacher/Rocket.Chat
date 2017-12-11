/* globals SystemLogger, RocketChat */

// TODO: cache/reload this setting
const rcWebhookToken = RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token');

/**
 * The SmartiRouter handels all incoming HTTP requests.
 * This is the only place, where adding routes to the Rocket.Chat API, related to Smarti
 * All HTTP inbound traffic (from Rocket.Chat to Smarti) should pass the this router.
 */

/**
 * Add an incoming webhook '/newConversationResult' to receive answers from Smarti.
 * This allows asynchronous callback from Smarti, when analyzing the conversation has finished.
 */
RocketChat.API.v1.addRoute('smarti.result/:_token', {authRequired: false}, {

	post() {

		check(this.bodyParams, Match.ObjectIncluding({
			conversationId: String,
			channelId: String
		}));

		//verify token
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
