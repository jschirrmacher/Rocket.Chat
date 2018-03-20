import { TranslationProviderRegistry } from '../autotranslate.js';
Meteor.methods({
	'autoTranslate.refreshProviderSettings'() {
		//Register call back & update the provider reference that need to be used.
		const activeTranslationProvider = TranslationProviderRegistry.getActiveServiceProvider();
		//activeTranslationProvider.registerAfterSaveMsgCallBack(activeTranslationProvider.name);
		RocketChat.AutoTranslate = activeTranslationProvider;
	}
});
