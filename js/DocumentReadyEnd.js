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

}

