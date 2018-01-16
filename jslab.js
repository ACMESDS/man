// UNCLASSIFIED

/**
 * @class ENGINE
 * @requires crypto
 * @requires glwip
 * @requires liegroup 
 * @requires mathjs
 * @requires digitalsignals
 * @requires nodehmm
 * @requires node-svd
 * @requires jsbayes
 * @requires recurrentjs
 * @requires gamma
 * @requires expectation-maximization
 * @requires multivariate-normal
 */

var JSLAB = module.exports = {  // js-engine plugins 
	MATH: require('mathjs'),
	LWIP: require('glwip'),
	DSP: require('digitalsignals'),
	GAMMA: require("gamma"),
	CRY: require('crypto'),
	//RAN: require("randpr"),
	SVD: require("node-svd"),
	//RNN: require("recurrentjs"),
	BNET: require("jsbayes"),
	MLE: require("expectation-maximization"),
	MVN: require("multivariate-normal"),
	VITA: require("nodehmm"),
	LOG: console.log,
	Log: console.log,
	JSON: JSON,			
	MAT: function (ctx,code) {
		var emctx = {};

		for (key in ctx) {
			val = ctx[key];
			emctx[key] = (val && val.constructor == Array) 
					? emctx[key] = EM.matrix(val)
					: val;
		}

		EM.eval(code, emctx);

		for (key in emctx) {
			val = emctx[key];
			ctx[key] = (val && val._data)
				? val._data
				: val;
		}
	}
};

var EM = JSLAB.MATH;

EM.import({
	isEqual: function (a,b) {
		return a==b;
	},
	disp: function (a) {
		console.log(a);
	}
});

// UNCLASSIFIED