/* eslint-env mocha */
/* eslint-disable func-names, prefer-arrow-callback, no-var, space-before-function-paren,
quotes, prefer-template, no-undef, no-unused-vars*/

import {adminEmail, adminPassword, adminUsername} from '../../data/user';
import {checkIfUserIsValid, checkIfUserIsAdmin} from '../../data/checks';
import sideNav from '../../pageobjects/side-nav.page';
import admin from '../../pageobjects/administration.page';

describe('auto translate', function() {
	describe('[Translation Settings]', function() {
		before(function() {
			try {
				checkIfUserIsAdmin(adminUsername, adminEmail, adminPassword);
				sideNav.spotlightSearch.waitForVisible(5000);
				sideNav.accountMenu.click();
				sideNav.admin.waitForVisible(5000);
				sideNav.admin.click();
			} catch (e) {
				console.log(e);
			}
		});
		after(() => {
			sideNav.preferencesClose.waitForVisible(5000);
			sideNav.preferencesClose.click();
		});

		describe('[Section: Message]', function() {
			before(() => {
				admin.messageLink.waitForVisible(5000);
				admin.messageLink.click();
			});

			describe('settings: Auto translate', function() {
				before(() => {
					if (admin.messageButtonCollapseAutotranslate.isVisible()) {
						admin.messageButtonCollapseAutotranslate.waitForVisible(10000);
						admin.messageButtonCollapseAutotranslate.click();
					}
					admin.messageButtonExpandAutotranslate.click();
					admin.messageButtonExpandGoogleMaps.click(); // Will make the auto translate section visible on the view port
				});
				it('enable auto translate', () => {
					if (browser.isVisible('[name="AutoTranslate_Enabled"]')) {
						if (admin.messageAutoTranslateEnable.isSelected()) {
							console.log('Auto translate is enabled');
						} else {
							console.log('Auto translate is disabled');
						}
						admin.messageAutoTranslateEnable.click();
					}
					admin.messageAutoTranslateEnable.isSelected().should.equal(true);
				});
				it('select provider', () => {
					if (admin.messageAutoTranslateEnable.isSelected() && admin.messageAutoTranslateProvider.isVisible()) {
						admin.messageAutoTranslateProvider.click('option=DeepL');
					}
					admin.messageAutoTranslateProvider.getValue().should.equal('deepl-translate');
				});
				it('API Key', () => {
					admin.messageAutoTranslateAPIKey.isVisible();
					browser.pause(1000);
					admin.messageAutoTranslateAPIKey.setValue(process.env.DEEPL_CONNECTION_KEY);
					admin.messageAutoTranslateAPIKey.getValue().should.equal(process.env.DEEPL_CONNECTION_KEY);
				});
				it('save changes', ()=>{
					admin.adminSaveChanges();
				});
			});
			after(() => {
				console.log('Auto translate settings saved.');
			});

		});
	});
});
