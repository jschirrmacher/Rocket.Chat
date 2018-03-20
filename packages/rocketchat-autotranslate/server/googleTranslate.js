import {AutoTranslate, TranslationProviderRegistry} from './autotranslate';
import _ from 'underscore';
import s from 'underscore.string';

class GoogleAutoTranslate extends AutoTranslate {
	/**
	 * Constructor
	 */
	constructor() {
		super();
		this.name = 'google-translate';
		this.apiEndPointUrl = 'https://translation.googleapis.com/language/translate/v2';
		// self register & de-register for callback - afterSaveMessage based on the activeProvider
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
			displayName: TAPi18n.__('AutoTranslate_Google'),
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

	getSupportedLanguages(target) {
		if (this.autoTranslateEnabled && this.apiKey) {
			if (this.supportedLanguages[target]) {
				return this.supportedLanguages[target];
			}

			let result;
			const params = {key: this.apiKey};
			if (target) {
				params.target = target;
			}

			try {
				result = HTTP.get('https://translation.googleapis.com/language/translate/v2/languages', {params});
			} catch (e) {
				if (e.response && e.response.statusCode === 400 && e.response.data && e.response.data.error && e.response.data.error.status === 'INVALID_ARGUMENT') {
					params.target = 'en';
					target = 'en';
					if (!this.supportedLanguages[target]) {
						result = HTTP.get('https://translation.googleapis.com/language/translate/v2/languages', {params});
					}
				}
			} finally {
				if (this.supportedLanguages[target]) {
					return this.supportedLanguages[target];
				} else {
					this.supportedLanguages[target || 'en'] = result && result.data && result.data.data && result.data.data.languages;
					return this.supportedLanguages[target || 'en'];
				}
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
					const query = `q=${ msgs.join('&q=') }`;

					const supportedLanguages = this.getSupportedLanguages('en');
					targetLanguages.forEach(language => {
						if (language.indexOf('-') !== -1 && !_.findWhere(supportedLanguages, {language})) {
							language = language.substr(0, 2);
						}
						let result;
						try {
							result = HTTP.get(this.apiEndPointUrl, {
								params: {
									key: this.apiKey,
									target: language
								}, query
							});
						} catch (e) {
							console.log('Error translating message', e);
							return message;
						}
						if (result.statusCode === 200 && result.data && result.data.data && result.data.data.translations && Array.isArray(result.data.data.translations) && result.data.data.translations.length > 0) {
							const txt = result.data.data.translations.map(translation => translation.translatedText).join('\n');
							translations[language] = this.deTokenize(Object.assign({}, targetMessage, {msg: txt}));
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
									if (result.statusCode === 200 && result.data && result.data.data && result.data.data.translations && Array.isArray(result.data.data.translations) && result.data.data.translations.length > 0) {
										const txt = result.data.data.translations.map(translation => translation.translatedText).join('\n');
										translations[language] = txt;
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
	TranslationProviderRegistry.registerProvider(new GoogleAutoTranslate());
	RocketChat.AutoTranslate = TranslationProviderRegistry.getActiveServiceProvider();
});
