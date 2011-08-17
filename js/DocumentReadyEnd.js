jQuery.ajax({ url: "/tiddlers?select=tag:systemConfig&fat=y", dataType: "json",
	success: function(tiddlers) {
		var adaptor = config.adaptors.tiddlyweb;
		for(var i = 0; i < tiddlers.length; i++) {
			store.addTiddler(adaptor.toTiddler(tiddlers[i], config.defaultCustomFields["server.host"]));
		}
		var pluginProblem = loadPlugins("systemConfig");
		if(pluginProblem) {
			story.displayTiddler(null,"PluginManager");
			displayMessage(config.messages.customConfigError);
		}
	}
});

jQuery.ajax({ url: "/tiddlers", dataType: "text",
	success: function(tiddlers) {
		var tiddler = new Tiddler("__Contents__");
		var titles = tiddlers.split("\n");
		var text = [];
		for(var i = 0; i < titles.length; i++) {
			text.push("* [[" + titles[i] + "]]");
		}
		tiddler.text = text.join("\n");
		store.saveTiddler(tiddler);
	}
});

}

