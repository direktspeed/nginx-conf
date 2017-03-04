var fs   = require('fs'),
	path = require('path');

var Config = (function() {
	function Config(name, parent) {
		this.name = name || '<root>';
		this.parent = parent;
		this.types = {};
		this.all = [];
	}
	
	return (function(constructor, prototype) {
		(function() {
			this.get = function get(type) {
				if(type === undefined)
					return this.all;
				else
					return this.types[type] = (this.types[type] || []);
			};
			
			this.add = function add(type, val) {
				this.get(type).push(val);
				this.get().push({ type: type, value: val });
				
				return this;
			};
		}).call(prototype);
		
		return this;
	}).call(Config, Config, Config.prototype)
})();

var types = {
	'def': {
		endOnNewLine: false
	},
	'section': {
		endOnNewLine: false
	}
};

function parseData(tokens, cb) {
	var config = new Config,
		ins    = [],
		line   = 0,
		i, token, type,
		curIn, inToken;

	function isIn(type, direct) {
		if(direct) return ins.length ? ins[0].type == type : false;
		else
			return ins.some(function(i) {
				return i.type == type;
			});
	}
	
	function inTo(type, data) {
		ins.unshift({ type: type, token: token, data: Object(data) });
		
		return ins[0];
	}
	
	function findIn(type) {
		return ins.filter(function(i) {
			return i.type == type;
		})[0];
	}
	
	function outOf(type, need) {
		var found = findIn(type);
		
		if(found)
			ins.splice(0, ins.indexOf(found) + 1);
		
		if(need && !found) throw new Error('Not in ' + type);
		
		return found;
	}

	for(i = 0; i < tokens.length; i++) {
		token       = tokens[i],
		type        = token.type,
		token.index = i,
		token.line  = line;
		
		if(isIn('string')) {
			if(type == 'string' && token.value == ins[0].token.value) {
				tokens[ins[0].token.index] = {
					type: 'value',
					value: tokens.slice(ins[0].token.index + 1, i).map(function(t) {
						return t.value
					}).join(''),
					index: ins[0].token.index,
					line: ins[0].token.line
				};
				tokens.splice(ins[0].token.index + 1, i - ins[0].token.index);
				i = ins[0].token.index - 1;
				line = ins[0].token.line;
				outOf('string');
			}
		} else if(isIn('comment')) {
			if(type == 'newline' && ins[0].token.value.length == 1) {
				config.add('comment', tokens.slice(
					findIn('comment').token.index + 1,
					token.index
				).map(function(t) {
					return t.value;
				}).join(''));
				outOf('comment');
			} else if(type == 'comment' &&
					ins[0].token.value.length == 3 &&
					token.value.length == 3)
				outOf('comment');
		} else {
			if(type == 'comment') {
				inTo('comment');
			} else if(type == 'newline') {
				line++;
				if(ins.length ? (types[ins[0].type] ? types[ins[0].type].endOnNewLine : true) : true)
					ins.shift();
			} else if(type == 'value') {
				if(isIn('def', true)) {
					config.add(ins[0].token.value, token.value);
					outOf('def');
				} else
					inTo('def');
			} else if(type == 'string') {
				inTo('string');
			} else if(type == 'section:open' && isIn('def')) {
				config = new Config(ins[0].token.value, config);
				inTo('section');
				config.parent.add(findIn('def').token.value, config);
			} else if(type == 'section:close' && isIn('section')) {
				if(findIn('def').data.params)
					config.params = findIn('def').data.params
						.map(function(t) {
							return t.value;
						}).join('');
				
				config = config.parent;
				outOf('def');
			} else if(type == 'parentheses:open') {
				inTo('parentheses');
			} else if(type == 'parentheses:close') {
				(function() {
					if(isIn('def'))
						findIn('def').data.params =
							tokens.slice(this.token.index + 1, token.index);
				}).call(outOf('parentheses', true));
			}
		}
	}
	
	return config;
}

function tokenizeData(data, cb) {
	if(Array.isArray(data)) return data;
	
	data = data.toString();
	
	var tokens = [],
		i, cur, newI, token;
	
	for(i = 0; i < data.length; i++) {
		cur = data[i];
		
		switch(cur) {
			case '#':
			case '###':
				tokens.push({ type: 'comment', value: cur })
				break;
			case ' ':
			case '\t':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'whitespace', value: cur });
				break;
			case '\n':
			case '\r':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'newline', value: cur });
				break;
			case '{':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'section:open', value: cur });
				break;
			case '}':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'section:close', value: cur });
				break;
			case ';':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'semicolon', value: cur });
				break;
			case '(':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'parentheses:open', value: cur });
				break;
			case ')':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'parentheses:close', value: cur });
				break;
			case '"':
			case '\'':
				if(token) {
					tokens.push(token);
					token = undefined;
				}
				tokens.push({ type: 'string', value: cur });
				break;
			default:
				(token = token || { type: 'value', value: '' })
					.value += cur;
				break;
		}
		
		if(newI !== undefined) { i = newI; newI = undefined; }
	}
	
	return tokens;
}

var parseAsync = function parseAsync(data, cb) {
	tokenizeAsync(data, function(e, tokens) {
		if(e) return process.nextTick(function() { cb(e); });
		
		var config;
		
		try {
			config = parseData(tokens);
			process.nextTick(function() { cb(null, config); });
		} catch(e) {
			process.nextTick(function() { cb(e); });
		}
	});
};

var parseSync = function parseSync(data) {
	return parseData(tokenizeSync(data));
};

var parse = exports.parse = function parse(data, cb) {
	if(typeof(cb) == 'function')
		parseAsync(data, cb);
	else
		return parseSync(data);
};

var tokenizeSync = function tokenizeSync(data) {
	if(path.existsSync(data))
		data = fs.readFileSync(data).toString();
	
	return tokenizeData(data);
};

var tokenizeAsync = function tokenizeAsync(data, cb) {
	function doIt(data) {
		var tokens;
	
		try {
			tokens = tokenizeData(data);
			process.nextTick(function() { cb(null, tokens); });
		} catch(e) {
			process.nextTick(function() { cb(e); });
		}
	}
	
	path.exists(data, function(exists) {
		if(exists)
			fs.readFile(data, function(e, d) {
				if(e) return cb(e);
				
				doIt(d.toString());
			});
		else
			doIt(data);
	});
};

var tokenize = exports.tokenize = function tokenize(data, cb) {
	if(typeof(cb) == 'function')
		tokenizeAsync(data, cb);
	else
		return tokenizeSync(data);
	/*path.exists(data, function(exists) {
		if(exists) {
			fs.readFile(data, function(err, data) {
				if(err) return cb(err);
				
				tokenizeData(data, cb);
			});
		} else {
			tokenizeData(data, cb);
		}
	});*/
};
