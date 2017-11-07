/* globals menu popover */
Template.sidebarItem.helpers({
	or(...args) {
		args.pop();
		return args.some(arg => arg);
	},
	isRoom() {
		return this.rid || this._id;
	}
});

Template.sidebarItem.events({
	'click [data-id], click .sidebar-item__link'() {
		return menu.close();
	},
	'mouseover [data-id]'(e) {
		if (this.additionalData) {
			const parent = document.querySelector('.main-content');
			const currentListItem = $(e.currentTarget);
			const listOffset = currentListItem.parent().position().top;
			const listItemOffset = currentListItem.position().top;
			let totalOffset = listOffset + listItemOffset;
			const hoverHeight = 300;
			if (totalOffset + hoverHeight > $(window).height()) {
				totalOffset -= hoverHeight - currentListItem.height();
			}
			const top = `${ totalOffset }px`;
			this.hoverView = Blaze.renderWithData(Template.sidebarItemHover, {
				top,
				content: this.additionalData,
				height: `${ hoverHeight }px`,
				refItem: this._id
			}, parent);
		}
	},
	'mouseout [data-id]'() {
		if (this.additionalData && this.hoverView) {
			Blaze.remove(this.hoverView);
		}
	},
	'click .sidebar-item__menu'(e) {
		const canLeave = () => {
			const roomData = Session.get(`roomData${ this.rid }`);

			if (!roomData) { return false; }

			return !(((roomData.cl != null) && !roomData.cl) || (['d', 'l'].includes(roomData.t)));
		};
		e.preventDefault();
		const items = [{
			icon: 'eye-off',
			name: t('Hide_room'),
			type: 'sidebar-item',
			id: 'hide'
		}];
		if (canLeave()) {
			items.push({
				icon: 'sign-out',
				name: t('Leave_room'),
				type: 'sidebar-item',
				id: 'leave',
				modifier: 'error'
			});
		}
		const config = {
			popoverClass: 'sidebar-item',
			columns: [
				{
					groups: [
						{
							items
						}
					]
				}
			],
			mousePosition: {
				x: e.clientX,
				y: e.clientY
			},
			data: {
				template: this.t,
				rid: this.rid,
				name: this.name
			}
		};

		popover.open(config);
	}
});
