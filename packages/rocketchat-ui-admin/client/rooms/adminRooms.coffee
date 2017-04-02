@AdminChatRoom = new Meteor.Collection('rocketchat_room')

Template.adminRooms.helpers
	isReady: ->
		return Template.instance().ready?.get()
	rooms: ->
		return Template.instance().rooms()
	isLoading: ->
		return 'btn-loading' unless Template.instance().ready?.get()
	hasMore: ->
		return Template.instance().limit?.get() is Template.instance().rooms?().count()
	roomCount: ->
		return Template.instance().rooms?().count()
	name: ->
		if @t is 'c' or @t is 'p' or @t is 'r' or @t is 'e'
			return @name
		else if @t is 'd'
			return @usernames.join ' x '
	type: ->
		if @t is 'c'
			return TAPi18n.__ 'Channel'
		else if @t is 'd'
			return TAPi18n.__ 'Direct Message'
		if @t is 'p'
			return TAPi18n.__ 'Private Group'
		if @t is 'r'
			return TAPi18n.__ 'Request'
		if @t is 'e'
			return TAPi18n.__ 'Expertise'
	default: ->
		if this.default
			return t('True')
		else
			return t('False')
	flexData: ->
		return {
			tabBar: Template.instance().tabBar
		}

Template.adminRooms.onCreated ->
	instance = @
	@limit = new ReactiveVar 50
	@filter = new ReactiveVar ''
	@types = new ReactiveVar []
	@ready = new ReactiveVar true

	@tabBar = new RocketChatTabBar();
	@tabBar.showGroup(FlowRouter.current().route.name);

	RocketChat.TabBar.addButton({
		groups: ['admin-rooms'],
		id: 'admin-room',
		i18nTitle: 'Room_Info',
		icon: 'icon-info-circled',
		template: 'adminRoomInfo',
		order: 1
	});

	RocketChat.ChannelSettings.addOption
		id: 'make-default'
		template: 'channelSettingsDefault'
		data: ->
			return Session.get('adminRoomsSelected')
		validation: ->
			return RocketChat.authz.hasAllPermission('view-room-administration')

	@autorun ->
		filter = instance.filter.get()
		types = instance.types.get()

		if types.length is 0
			types = ['c', 'd', 'p', 'r', 'e']

		limit = instance.limit.get()
		subscription = instance.subscribe 'adminRooms', filter, types, limit
		instance.ready.set subscription.ready()

	@rooms = ->
		filter = _.trim instance.filter?.get()
		types = instance.types?.get()

		unless _.isArray types
			types = []

		query = {}

		filter = _.trim filter
		if filter
			filterReg = new RegExp s.escapeRegExp(filter), "i"
			query = { $or: [ { name: filterReg }, { t: 'd', usernames: filterReg } ] }

		if types.length
			query['t'] = { $in: types }

		return AdminChatRoom.find(query, { limit: instance.limit?.get(), sort: { default: -1, name: 1 } })

	@getSearchTypes = ->
		return _.map $('[name=room-type]:checked'), (input) -> return $(input).val()

Template.adminRooms.onRendered ->
	Tracker.afterFlush ->
		SideNav.setFlex "adminFlex"
		SideNav.openFlex()

Template.adminRooms.events
	'keydown #rooms-filter': (e) ->
		if e.which is 13
			e.stopPropagation()
			e.preventDefault()

	'keyup #rooms-filter': (e, t) ->
		e.stopPropagation()
		e.preventDefault()
		t.filter.set e.currentTarget.value

	'click .room-info': (e, instance) ->
		e.preventDefault()

		Session.set('adminRoomsSelected', { rid: @_id });

		instance.tabBar.open('admin-room')

	'click .load-more': (e, t) ->
		e.preventDefault()
		e.stopPropagation()
		t.limit.set t.limit.get() + 50

	'change [name=room-type]': (e, t) ->
		t.types.set t.getSearchTypes()
