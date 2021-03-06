/* eslint no-multi-spaces: 0 */
/*  globals SystemLogger */

import {permissionLevel} from '../lib/rocketchat';

Meteor.startup(function() {
	// Note:
	// 1.if we need to create a role that can only edit channel message, but not edit group message
	// then we can define edit-<type>-message instead of edit-message
	// 2. admin, moderator, and user roles should not be deleted as they are referened in the code.
	const permissions = [
		{ _id: 'access-permissions',            roles : ['admin'] },
		{ _id: 'access-setting-permissions', 	roles: 	['admin']},
		{ _id: 'add-oauth-service',             roles : ['admin'] },
		{ _id: 'add-user-to-joined-room',       roles : ['admin', 'owner', 'moderator', 'user'] },
		{ _id: 'add-user-to-any-c-room',        roles : ['admin'] },
		{ _id: 'add-user-to-any-p-room',        roles : [] },
		{ _id: 'archive-room',                  roles : ['admin', 'owner'] },
		{ _id: 'ban-user',                      roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'bulk-create-c',                 roles : ['admin'] },
		{ _id: 'bulk-register-user',            roles : ['admin'] },
		{ _id: 'create-c',                      roles : ['admin', 'user', 'bot'] },
		{ _id: 'create-d',                      roles : ['admin', 'user', 'bot'] },
		{ _id: 'create-p',                      roles : ['admin', 'user', 'bot'] },
		{ _id: 'create-user',                   roles : ['admin'] },
		{ _id: 'clean-channel-history',         roles : ['admin'] }, // special permission to bulk delete a channel's mesages
		{ _id: 'delete-c',                      roles : ['admin', 'owner'] },
		{ _id: 'delete-d',                      roles : ['admin'] },
		{ _id: 'delete-message',                roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'delete-p',                      roles : ['admin', 'owner'] },
		{ _id: 'delete-user',                   roles : ['admin'] },
		{ _id: 'edit-message',                  roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'edit-other-user-active-status', roles : ['admin'] },
		{ _id: 'edit-other-user-info',          roles : ['admin'] },
		{ _id: 'edit-other-user-password',      roles : ['admin'] },
		{ _id: 'edit-privileged-setting',       roles : ['admin'] },
		{ _id: 'edit-room',                     roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'force-delete-message',          roles : ['admin', 'owner'] },
		{ _id: 'join-without-join-code',        roles : ['admin', 'bot'] },
		{ _id: 'leave-c',                       roles : ['admin', 'user', 'bot', 'anonymous'] },
		{ _id: 'leave-p',                       roles : ['admin', 'user', 'bot', 'anonymous'] },
		{ _id: 'manage-assets',                 roles : ['admin'] },
		{ _id: 'manage-emoji',                  roles : ['admin'] },
		{ _id: 'manage-integrations',           roles : ['admin'] },
		{ _id: 'manage-own-integrations',       roles : ['admin', 'bot'] },
		{ _id: 'manage-oauth-apps',             roles : ['admin'] },
		{ _id: 'manage-selected-settings', 		roles: 	['admin']},
		{ _id: 'mention-all',                   roles : ['admin', 'owner', 'moderator', 'user'] },
		{ _id: 'mention-here',                  roles : ['admin', 'owner', 'moderator', 'user'] },
		{ _id: 'mute-user',                     roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'pin-message', 					roles:  ['admin', 'owner', 'moderator', 'user'] },
		{ _id: 'remove-user',                   roles : ['admin', 'owner', 'moderator'] },
		{ _id: 'run-import',                    roles : ['admin'] },
		{ _id: 'run-migration',                 roles : ['admin'] },
		{ _id: 'set-moderator',                 roles : ['admin', 'owner'] },
		{ _id: 'set-owner',                     roles : ['admin', 'owner'] },
		{ _id: 'send-many-messages',            roles : ['admin', 'bot'] },
		{ _id: 'set-leader',                    roles : ['admin', 'owner'] },
		{ _id: 'unarchive-room',                roles : ['admin'] },
		{ _id: 'view-c-room',                   roles : ['admin', 'user', 'bot', 'anonymous'] },
		{ _id: 'user-generate-access-token',    roles : ['admin'] },
		{ _id: 'view-d-room',                   roles : ['admin', 'user', 'bot'] },
		{ _id: 'view-full-other-user-info',     roles : ['admin'] },
		{ _id: 'view-history',                  roles : ['admin', 'user', 'anonymous'] },
		{ _id: 'view-joined-room',              roles : ['guest', 'bot', 'anonymous'] },
		{ _id: 'view-join-code',                roles : ['admin'] },
		{ _id: 'view-logs',                     roles : ['admin'] },
		{ _id: 'view-other-user-channels',      roles : ['admin'] },
		{ _id: 'view-p-room',                   roles : ['admin', 'user', 'anonymous'] },
		{ _id: 'view-privileged-setting',       roles : ['admin'] },
		{ _id: 'view-room-administration',      roles : ['admin'] },
		{ _id: 'view-statistics',               roles : ['admin'] },
		{ _id: 'view-user-administration',      roles : ['admin'] },
		{ _id: 'preview-c-room',                roles : ['admin', 'user', 'anonymous'] },
		{ _id: 'view-outside-room',             roles : ['admin', 'owner', 'moderator', 'user', 'guest'] },
		{ _id: 'view-broadcast-member-list',    roles : ['admin', 'owner', 'moderator'] }
	];

	for (const permission of permissions) {
		if (!RocketChat.models.Permissions.findOneById(permission._id)) {
			RocketChat.models.Permissions.upsert(permission._id, {$set: permission});
		}
	}

	const defaultRoles = [
		{name: 'admin', scope: 'Users', description: 'Admin'},
		{name: 'moderator', scope: 'Subscriptions', description: 'Moderator'},
		{name: 'leader', scope: 'Subscriptions', description: 'Leader'},
		{name: 'owner', scope: 'Subscriptions', description: 'Owner'},
		{name: 'user', scope: 'Users', description: ''},
		{name: 'bot', scope: 'Users', description: ''},
		{name: 'guest', scope: 'Users', description: ''},
		{name: 'anonymous', scope: 'Users', description: ''}
	];

	for (const role of defaultRoles) {
		RocketChat.models.Roles.upsert({_id: role.name}, {
			$setOnInsert: {
				scope: role.scope,
				description: role.description || '',
				protected: true
			}
		});
	}


	// setting-based permissions
	const getSettingPermissionId = function(settingId) {
		return `change-setting-${ settingId }`;
	};

	const getPreviousPermissions = function(settingId) {
		const previousSettingPermissions = {};

		const selector = {level: permissionLevel.SETTING};
		if (settingId) {
			selector.settingId = settingId;
		}

		RocketChat.models.Permissions.find(selector).fetch().forEach(
			function(permission) {
				previousSettingPermissions[permission._id] = permission;
			});
		return previousSettingPermissions;
	};
	const createSettingPermission = function(setting, previousSettingPermissions) {
		const permissionId = getSettingPermissionId(setting._id);
		const permission = {
			_id: permissionId,
			level: permissionLevel.SETTING,
			//copy those setting-properties which are needed to properly publish the setting-based permissions
			settingId: setting._id,
			group: setting.group,
			section: setting.section,
			sorter: setting.sorter
		};
		// copy previously assigned roles if available
		if (previousSettingPermissions[permissionId] && previousSettingPermissions[permissionId].roles) {
			permission.roles = previousSettingPermissions[permissionId].roles;
		} else {
			permission.roles = [];
		}
		if (setting.group) {
			permission.groupPermissionId = getSettingPermissionId(setting.group);
		}
		if (setting.section) {
			permission.sectionPermissionId = getSettingPermissionId(setting.section);
		}
		RocketChat.models.Permissions.upsert(permission._id, {$set: permission});
		delete previousSettingPermissions[permissionId];
	};

	const createPermissionsForExistingSettings = function() {
		const previousSettingPermissions = getPreviousPermissions();

		RocketChat.models.Settings.findNotHidden().fetch().forEach((setting) => {
			createSettingPermission(setting, previousSettingPermissions);
		});

		// remove permissions for non-existent settings
		for (const obsoletePermission in previousSettingPermissions) {
			if (previousSettingPermissions.hasOwnProperty(obsoletePermission)) {
				RocketChat.models.Permissions.remove({_id: obsoletePermission});
				SystemLogger.info('Removed permission', obsoletePermission);
			}
		}
	};

	// for each setting which already exists, create a permission to allow changing just this one setting
	createPermissionsForExistingSettings();

	// register a callback for settings for be create in higher-level-packages
	const createPermissionForAddedSetting = function(settingId) {
		const previousSettingPermissions = getPreviousPermissions(settingId);
		const setting = RocketChat.models.Settings.findOneById(settingId);
		if (setting) {
			if (!setting.hidden) {
				createSettingPermission(setting, previousSettingPermissions);
			}
		} else {
			SystemLogger.error('Could not create permission for setting', settingId);
		}
	};

	RocketChat.settings.onload('*', createPermissionForAddedSetting);
});
