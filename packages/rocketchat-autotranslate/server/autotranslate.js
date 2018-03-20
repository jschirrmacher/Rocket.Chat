export class AutoTranslate {
	constructor() {
		this.languages = [];
		this.supportedLanguages = {};
		this.apiKey = RocketChat.settings.get('AutoTranslate_APIKey');
		this.autoTranslateEnabled = RocketChat.settings.get('AutoTranslate_Enabled');
		RocketChat.settings.get('AutoTranslate_Enabled', (key, value) => {
			this.autoTranslateEnabled = value;
		});
		RocketChat.settings.get('AutoTranslate_APIKey', (key, value) => {
			this.apiKey = value;
		});
	}

	tokenize(message) {
		if (!message.tokens || !Array.isArray(message.tokens)) {
			message.tokens = [];
		}
		message = this.tokenizeEmojis(message);
		message = this.tokenizeCode(message);
		message = this.tokenizeURLs(message);
		message = this.tokenizeMentions(message);
		return message;
	}

	tokenizeEmojis(message) {
		let count = message.tokens.length;
		message.msg = message.msg.replace(/:[+\w\d]+:/g, function(match) {
			const token = `<i class=notranslate>{${ count++ }}</i>`;
			message.tokens.push({
				token,
				text: match
			});
			return token;
		});

		return message;
	}

	tokenizeURLs(message) {
		let count = message.tokens.length;

		const schemes = RocketChat.settings.get('Markdown_SupportSchemesForLink').split(',').join('|');

		// Support ![alt text](http://image url) and [text](http://link)
		message.msg = message.msg.replace(new RegExp(`(!?\\[)([^\\]]+)(\\]\\((?:${ schemes }):\\/\\/[^\\)]+\\))`, 'gm'), function(match, pre, text, post) {
			const pretoken = `<i class=notranslate>{${ count++ }}</i>`;
			message.tokens.push({
				token: pretoken,
				text: pre
			});

			const posttoken = `<i class=notranslate>{${ count++ }}</i>`;
			message.tokens.push({
				token: posttoken,
				text: post
			});

			return pretoken + text + posttoken;
		});

		// Support <http://link|Text>
		message.msg = message.msg.replace(new RegExp(`((?:<|&lt;)(?:${ schemes }):\\/\\/[^\\|]+\\|)(.+?)(?=>|&gt;)((?:>|&gt;))`, 'gm'), function(match, pre, text, post) {
			const pretoken = `<i class=notranslate>{${ count++ }}</i>`;
			message.tokens.push({
				token: pretoken,
				text: pre
			});

			const posttoken = `<i class=notranslate>{${ count++ }}</i>`;
			message.tokens.push({
				token: posttoken,
				text: post
			});

			return pretoken + text + posttoken;
		});

		return message;
	}

	tokenizeCode(message) {
		let count = message.tokens.length;

		message.html = message.msg;
		message = RocketChat.Markdown.parseMessageNotEscaped(message);
		message.msg = message.html;

		for (const tokenIndex in message.tokens) {
			if (message.tokens.hasOwnProperty(tokenIndex)) {
				const token = message.tokens[tokenIndex].token;
				if (token.indexOf('notranslate') === -1) {
					const newToken = `<i class=notranslate>{${ count++ }}</i>`;
					message.msg = message.msg.replace(token, newToken);
					message.tokens[tokenIndex].token = newToken;
				}
			}
		}

		return message;
	}

	tokenizeMentions(message) {
		let count = message.tokens.length;

		if (message.mentions && message.mentions.length > 0) {
			message.mentions.forEach(mention => {
				message.msg = message.msg.replace(new RegExp(`(@${ mention.username })`, 'gm'), match => {
					const token = `<i class=notranslate>{${ count++ }}</i>`;
					message.tokens.push({
						token,
						text: match
					});
					return token;
				});
			});
		}

		if (message.channels && message.channels.length > 0) {
			message.channels.forEach(channel => {
				message.msg = message.msg.replace(new RegExp(`(#${ channel.name })`, 'gm'), match => {
					const token = `<i class=notranslate>{${ count++ }}</i>`;
					message.tokens.push({
						token,
						text: match
					});
					return token;
				});
			});
		}

		return message;
	}

	deTokenize(message) {
		if (message.tokens && message.tokens.length > 0) {
			for (const {token, text, noHtml} of message.tokens) {
				message.msg = message.msg.replace(token, () => noHtml ? noHtml : text);
			}
		}
		return message.msg;
	}

	// abstract method must be implemented
	getSupportedLanguages() {

	}

	// abstract method must be implemented
	_getProviderMetadata() {
	}

	// abstract method must be implemented.
	translateMessage() {
	}

	// Registers afterSaveMessage based on the selected service provider.
	registerAfterSaveMsgCallBack(name) {
		RocketChat.callbacks.add('afterSaveMessage', this.translateMessage.bind(this), RocketChat.callbacks.priority.MEDIUM, name);
	}

	// De-registers afterSaveMessage callback when different provider selected.
	deRegisterAfterSaveMsgCallBack(name) {
		RocketChat.callbacks.remove('afterSaveMessage', name);
	}
}

export class TranslationProviderRegistry {
	static registerProvider(provider) {
		//get provider information
		const metadata = provider._getProviderMetadata();
		if (!TranslationProviderRegistry._providers) {
			TranslationProviderRegistry._providers = {};
		}
		TranslationProviderRegistry._providers[metadata.name] = provider;
	}

	static initProviderSettings() {
		RocketChat.settings.get('AutoTranslate_ServiceProvider', (key, value) => {
			TranslationProviderRegistry._activeProvider = value;
		});
	}

	static getActiveServiceProvider() {
		return TranslationProviderRegistry._providers[TranslationProviderRegistry._activeProvider];
	}
}

Meteor.startup(() => {
	TranslationProviderRegistry.initProviderSettings();
});

