import {TranslationProviderRegistry, AutoTranslate} from 'meteor/rocketchat:autotranslate';
import {RocketChat} from 'meteor/rocketchat:lib';
import _ from 'underscore';

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
			if (this.supportedLanguages[target]) {
				return this.supportedLanguages[target];
			}
			return this.supportedLanguages[target] = [
				{
					'language': 'EN',
					'name': 'English'
				},
				{
					'language': 'DE',
					'name': 'German'
				},
				{
					'language': 'FR',
					'name': 'French'
				},
				{
					'language': 'ES',
					'name': 'Spanish'
				},
				{
					'language': 'IT',
					'name': 'Italian'
				},
				{
					'language': 'NL',
					'name': 'Dutch'
				},
				{
					'language': 'PL',
					'name': 'Polish'
				}
			];
		}
	}

	issueTranslateRequestMessage(targetMessage, targetLanguages) {
		const translations = {};
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
			}
			if (result.statusCode === 200 && result.data && result.data.translations && Array.isArray(result.data.translations) && result.data.translations.length > 0) {
				// store translation only when the source and target language are different.
				if (result.data.translations.map(translation => translation.detected_source_language).join() !== language) {
					const txt = result.data.translations.map(translation => translation.text).join('\n');
					translations[language] = this.deTokenize(Object.assign({}, targetMessage, {msg: txt}));
				}
			}
		});
		return translations;
	}

	issueTranslateRequestMessageAttachments(attachment, targetLanguages) {
		const translations = {};
		const query = `text=${ encodeURIComponent(attachment.description || attachment.text) }`;
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
				console.log('Error translating message attachment', e);
			}
			if (result.statusCode === 200 && result.data && result.data.translations && Array.isArray(result.data.translations) && result.data.translations.length > 0) {
				if (result.data.translations.map(translation => translation.detected_source_language).join() !== language) {
					const txt = result.data.translations.map(translation => translation.text).join('\n');
					translations[language] = txt;
				}
			}
		});
		return translations;
	}
}


Meteor.startup(() => {
	TranslationProviderRegistry.registerProvider(new DeeplAutoTranslate());
	RocketChat.AutoTranslate = TranslationProviderRegistry.getActiveServiceProvider();
});
