import {TranslationProviderRegistry, AutoTranslate} from 'meteor/rocketchat:autotranslate';
import {RocketChat} from 'meteor/rocketchat:lib';
import _ from 'underscore';
import s from 'underscore.string';

class DeeplAutoTranslate extends AutoTranslate {
	/**
	 * Constructor
	 */
	constructor() {
		super();
		this.name = 'deepl-translate';
		this.apiEndPointUrl = 'https://api.deepl.com/v1/translate';
		// self register & de-register callback - afterSaveMessage based on the activeProvider
		RocketChat.settings.get('AutoTranslate_ServiceProvider', (key, value) => {
			if (this.name !== value) {
				this.deRegisterAfterSaveMsgCallBack(this.name);
			} else {
				this.registerAfterSaveMsgCallBack(this.name);
			}
		});
	}

	/**
	 * Returns metadata information about the service provide
	 * @protected implements super abstract method.
	 */
	_getProviderMetadata() {
		return {
			name: this.name,
			displayName: TAPi18n.__('AutoTranslate_DeepL'),
			settings: this._getSettings()
		};
	}

	/**
	 * Returns necessary settings information
	 * about the translation service provider.
	 * @protected
	 */
	_getSettings() {
		return {
			apiKey: this.apiKey,
			apiEndPointUrl: this.apiEndPointUrl
		};
	}

	/**
	 * Return supported languages for translation
	 */
	getSupportedLanguages(target) {
		if (this.autoTranslateEnabled && this.apiKey) {
			if (!this.supportedLanguages[target]) {
				return [
					{
						'language': 'EN'
					},
					{
						'language': 'DE'
					},
					{
						'language': 'FR'
					},
					{
						'language': 'ES'
					},
					{
						'language': 'IT'
					},
					{
						'language': 'NL'
					},
					{
						'language': 'PL'
					}
				];
			}
		}
	}

	translateMessage(message, room, targetLanguage) {
		if (this.autoTranslateEnabled && this.apiKey) {
			let targetLanguages;
			if (targetLanguage) {
				targetLanguages = [targetLanguage];
			} else {
				targetLanguages = RocketChat.models.Subscriptions.getAutoTranslateLanguagesByRoomAndNotUser(room._id, message.u && message.u._id);
			}
			if (message.msg) {
				Meteor.defer(() => {
					const translations = {};
					let targetMessage = Object.assign({}, message);

					targetMessage.html = s.escapeHTML(String(targetMessage.msg));
					targetMessage = this.tokenize(targetMessage);

					let msgs = targetMessage.msg.split('\n');
					msgs = msgs.map(msg => encodeURIComponent(msg));
					const query = `text=${ msgs.join('&text=') }`;

					const supportedLanguages = this.getSupportedLanguages('en');
					targetLanguages.forEach(language => {
						if (language.indexOf('-') !== -1 && !_.findWhere(supportedLanguages, {language})) {
							language = language.substr(0, 2);
						}
						let result;
						try {
							result = HTTP.get(this.apiEndPointUrl, {
								params: {
									auth_key: this.apiKey,
									target_lang: language
								}, query
							});
						} catch (e) {
							console.log('Error translating message', e);
							return message;
						}
						if (result.statusCode === 200 && result.data && result.data.translations && Array.isArray(result.data.translations) && result.data.translations.length > 0) {
							// store translation only when the source and target language are different.
							if (result.data.translations.map(translation => translation.detected_source_language).join() !== language) {
								const txt = result.data.translations.map(translation => translation.text).join('\n');
								translations[language] = this.deTokenize(Object.assign({}, targetMessage, {msg: txt}));
							}
						}
					});
					if (!_.isEmpty(translations)) {
						RocketChat.models.Messages.addTranslations(message._id, translations);
					}
				});
			}

			if (message.attachments && message.attachments.length > 0) {
				Meteor.defer(() => {
					for (const index in message.attachments) {
						if (message.attachments.hasOwnProperty(index)) {
							const attachment = message.attachments[index];
							const translations = {};
							if (attachment.description || attachment.text) {
								const query = `q=${ encodeURIComponent(attachment.description || attachment.text) }`;
								const supportedLanguages = this.getSupportedLanguages('en');
								targetLanguages.forEach(language => {
									if (language.indexOf('-') !== -1 && !_.findWhere(supportedLanguages, {language})) {
										language = language.substr(0, 2);
									}
									const result = HTTP.get(this.apiEndPointUrl, {
										params: {
											key: this.apiKey,
											target: language
										}, query
									});
									if (result.statusCode === 200 && result.data && result.data.translations && Array.isArray(result.data.translations) && result.data.translations.length > 0) {
										if (result.data.translations.map(translation => translation.detected_source_language).join() !== language) {
											const txt = result.data.translations.map(translation => translation.translatedText).join('\n');
											translations[language] = txt;
										}
									}
								});
								if (!_.isEmpty(translations)) {
									RocketChat.models.Messages.addAttachmentTranslations(message._id, index, translations);
								}
							}
						}
					}
				});
			}
		}
		return message;
	}
}


Meteor.startup(() => {
	TranslationProviderRegistry.registerProvider(new DeeplAutoTranslate());
});
