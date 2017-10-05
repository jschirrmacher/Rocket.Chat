/**
 * Created by OliverJaegle on 01.08.2016.
 */
// var _ = Npm.require('underscore');

_.extend(RocketChat.models.Rooms, {
	addHelpRequestInfo(room, helpRequestId) {
		const query = {_id: room._id};

		const update = {
			$set: {
				helpRequestId,
				v: room.u //Depict the owner of the room as visitor, similar like in livechat
			}
		};

		return this.update(query, update);
	},
	findByNameContainingTypesAndTags(name, types, options) {
		const nameRegex = new RegExp(s.trim(s.escapeRegExp(name)), 'i');

		const $or = [];
		for (const type of Array.from(types)) {
			const obj = {name: nameRegex, t: type.type};
			if (type.username != null) {
				obj.usernames = type.username;
			}
			if (type.ids != null) {
				obj._id = {$in: type.ids};
			}
			$or.push(obj);
		}

		$or.push({tags: {$elemMatch: {'$regex': nameRegex}}});
		const query =
			{$or};

		return this.find(query, options);
	},

	/**
	 * Find all public accessible rooms where the given user is not subscribed to
	 *
	 * @param {string} username - the username which should be excluded
	 * @param options
	 */
	findAllPublicNotContainingUserName(username, options) {
		const query = {
			t: {
				//todo are those types all public accesible ones?
				$in: ['r', 'l', 'c']
			},
			usernames: {
				$ne: username
			}
		};

		return this.find(query, options);
	}
});
