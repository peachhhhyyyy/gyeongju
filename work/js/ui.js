var ui = { 
	// sitemap
	toggleSitemap : function(obj) {
		$('.header__inner__gnb__etc__list .sitemapicon a').on('click', function() {
			$('.sitemap, body').addClass('is-active');
		});
		$('.button--close').on('click', function() {
			$('.sitemap, body').removeClass('is-active');
		});
	}, 
	// mobile gnb and sitemap 
	toggleSitemapM : function(obj) {
		var sitemapItem = $('.sitemap__item');
		var first = $('.sitemap__item--first');
		var second = $('.sitemap__item--second');
		var third = $('.sitemap__item--third').prev();

		sitemapItem.each(function() {		
			first.click(function() {
				if($(this).hasClass('opened') == false) {
					$(this).addClass('opened');
				} else {
					$(this).removeClass('opened');
				};
			});
			third.click(function(e) {
				e.preventDefault();
				if($(this).hasClass('opened') == false) {
					$(this).addClass('opened current');
				} else {
					$(this).removeClass('opened current');
				};
			});
		});
	},
	// breadcrumb 
	toggleBreadcrumb : function(obj) {
		var breadCrumb = $('.breadcrumb__item--multiple');
		var target = $('.breadcrumb__item--multiple > a');
		var toast = $('.breadcrumb__toast > a');

		$('.breadcrumb').each(function() {
			target.on('click', function(e) {
				e.preventDefault();
				$(this).parent(breadCrumb).addClass('is-active').siblings().removeClass('is-active');
			}, function() {
				if($(this).parent(breadCrumb).hasClass('is-active') == false) {
					$(this).parent(breadCrumb).addClass('is-active');
				} else {
					$(this).parent(breadCrumb).removeClass('is-active');
					toast.removeClass('current');
				}
			});
		});
	},
	// scroll
	scrollEvent : function(obj) {
		$(window).scroll(function() {
			var nowScroll = $(window).scrollTop();
			var defaultGnb = $('.header');
			var mainGnb = $('.header.header--main');

			defaultGnb.hide();
			if(mainGnb.length > 0) {
				mainGnb.show();
				if(nowScroll == 0) {
					defaultGnb.hide();
					mainGnb.show();
				} else {
					defaultGnb.show();
					mainGnb.hide();
				}
			} else {
				defaultGnb.show();
			}
		});
	},
	// mouseover
	mouseEvent : function(obj) {
		$('#gnb .dep01__list > li').on('mouseenter', function() {
			$('.header__inner__gnb__list__dep02').hide();
			$('body').addClass('is-active');
			$(this).find('.header__inner__gnb__list__dep02').show();
		});
		$('.header').on('mouseleave', function() {
			$('.header__inner__gnb__list__dep02').hide();
			$('body').removeClass('is-active');
		});
	}
};

var windowWidth = $(window).width();

// default
if(windowWidth > 768) {
	ui.toggleSitemap();
	ui.toggleBreadcrumb();
	ui.scrollEvent();
	ui.mouseEvent();
} else {
	ui.toggleSitemap();
	ui.toggleSitemapM();
	ui.scrollEvent();
}

// resize
$(window).resize(function() {
	if(windowWidth > 768) {
		ui.toggleSitemap();
		ui.toggleBreadcrumb();
		ui.scrollEvent();
		ui.mouseEvent();
	} else {
		ui.toggleSitemap();
		ui.toggleSitemapM();
		ui.scrollEvent();
	}
});