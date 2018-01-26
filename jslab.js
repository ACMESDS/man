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
	//RAN: require("randpr"),  // added by debe to avoid recursive requires
	//SVD: require("node-svd"),
	//RNN: require("recurrentjs"),
	BAYS: require("jsbayes"),
	MLE: require("expectation-maximization"),
	MVN: require("multivariate-normal"),
	VITA: require("nodehmm"),
	LOG: console.log,
	Log: console.log,
	JSON: JSON,	
	plugins: {
		news: news,
		estmix: estmix,
		genpr: genpr,
		estpr: estpr
	},
	require: function (pk) {
		console.log("jslab blocked package require");
	},
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

//=========== Extend matlab emulator

var EM = JSLAB.MATH;

EM.import({
	isEqual: function (a,b) {
		return a==b;
	},
	disp: function (a) {
		console.log(a);
	}
});

//=========== Plugins

function news(ctx, res) {  
	var 
		sql = ctx.sql,
		parts = ctx.Message.split("@"),
		subj = parts[0],
		rhs = parts[1] || "",
		to = rhs.substr(0,rhs.indexOf(" ")),
		body = rhs.substr(to.length);

	Trace(`FEEDNEWS ${to}`, sql);

	switch (to) {
		case "conseq":

		case "wicwar":

		case "jira":
			break;

		case "":
			break;

		default:
			sendMail({
				to:  to,
				subject: subj,
				html: body.format( {
					today: new Date(),
					me: req.client
				}),
				alternatives: [{
					contentType: 'text/html; charset="ISO-8859-1"',
					contents: ""
				}]
			}, sql);
	}

	sql.query("SELECT ID,datediff(now(),Starts) AS Age, Stay FROM news HAVING Age>Stay")
	.on("result", function (news) {
		sql.query("DELETE FROM news WHERE ?",{ID:news.ID});
	});

	sql.query("UPDATE news SET age=datediff(now(),Starts)");

	sql.query("UPDATE news SET fuse=Stay-datediff(now(),Starts)");

	sql.query("SELECT * FROM news WHERE Category LIKE '%/%'")
	.on("result", function (news) {  
		var parts = news.Category.split("/"), name = parts[0], make = parts[1], client = "system";

		sql.query(
			  "SELECT intake.*, link(intake.Name,concat(?,intake.Name)) AS Link, "
			+ "link('dashboard',concat('/',lower(intake.Name),'.view')) AS Dashboard, "
			+ "sum(datediff(now(),queues.Arrived)) AS Age, min(queues.Arrived) AS Arrived, "
			//+ "link(concat(queues.sign0,queues.sign1,queues.sign2,queues.sign3,queues.sign4,queues.sign5,queues.sign6,queues.sign7),concat(?,intake.Name)) AS Waiting, "
			+ "link(states.Name,'/parms.view') AS State "
			+ "FROM intake "
			+ "LEFT JOIN queues ON (queues.Client=? and queues.State=intake.TRL and queues.Class='TRL' and queues.Job=intake.Name) "
			+ "LEFT JOIN states ON (states.Class='TRL' and states.State=intake.TRL) "
			+ "WHERE intake.?", ["/intake.view?name=","/queue.view?name=",client,{ Name:name }] ) 
		.on("error", function (err) {
			Log(err);
		})
		.on("result", function (sys) {
			var msg = sys.Link+" "+make.format(sys);

			sql.query("UPDATE news SET ? WHERE ?", [
				{	Message: msg,
					New: msg != news.Message ? -1 : 0
				}, 
				{ID:news.ID}
			]);
		});
	});
}

function xss(ctx,res) {
	res([
		{lat:33.902,lon:70.09,alt:22,t:10},
		{lat:33.902,lon:70.09,alt:12,t:20}
	]);
}	

function sss(ctx,res) {
/*
Use the FLEX randpr plugin to send spoofed streaming data.
*/
	//Log(ctx);
	
	FLEX.randpr( ctx, function (evs) {
		res( evs );
	});
}

function wms(ctx,res) {
	res(  {spoof:1} );
}

function wfs(ctx,res) {
/*
Respond with ess-compatible image catalog to induce image-spoofing in the chipper.
*/
	res({
		GetRecordsResponse: {
			SearchResults: {
				DatasetSummary: [{
					"Image-Product": {
						Image: {
							ImageId: "spoof",
							"Image-Sun-Characteristic": {
								SunElevationDim: "0", 
								SunAzimuth: "0"
							},
							"Image-Raster-Object-Representation": [],
							"Image-Atmospheric-Characteristic": []
						},
						"Image-Restriction": {
							Classification: "?", 
							ClassificationSystemId: "?", 
							LimitedDistributionCode: ["?"]
						},
						"Image-Country-Coverage": {
							CountryCode: ["??"]
						}
					},
					WMSUrl: "https://localhost:8080/shares/spoof.jpg?",
					WMTSUrl: "",
					JPIPUrl: ""
				}]
			}
		}
	});
}

function estmix(ctx,res) {
/*
Respond with {mu,sigma} estimates to the [x,y,...] app.events given ctx parameters:
	Mixes = number of mixed to attempt to find
	Refs = [ref, ref, ...] optional references [x,y,z] to validate estimates
	Select = event getter (cb(evs))
*/

	var 
		Log = console.log,
		Mixes = ctx.Mixes,
		Refs = ctx.Refs,
		Select = ctx.Select;

	function dist(a,b) { 
		var d = [ a[0]-b[0], a[1]-b[1] ];
		return sqrt( d[0]*d[0] + d[1]*d[1] );
	}

	Array.prototype.nearestOf = function (metric) {
		var imin = 0, emin = 1e99;

		this.each( function (i,ctx) {
			var e = metric( ctx );
			if (  e < emin) { imin = i; emin = e; }
		});
		return {idx: imin, err: emin};
	}

	Select( function (evs) {
		
		var evlist = [];
		//Log("mix evs", evs.length, Mixes);
		
		evs.each( function (n,ev) {
			evlist.push( [ev.x,ev.y,ev.z] );
		});

		var 
			obs = {at: "end", mles: RAN.MLE(evlist, Mixes), refs: Refs},
			mles = obs.mles,
			refs = obs.refs;

		if (refs)  {  // requesting a ref check
			mles.each( function (k,mle) {  // find nearest ref event
				mle.find = refs.nearestOf( function (ctx) {
					return dist( refs, mle.mu );
				});
			});

			mles.sort( function (a,b) {  // sort em by indexes
				return a.find.idx < b.find.idx ? 1 : -1;
			});

			mles.each(function (n,mle) {    // save ref checks
				refs.push({
					idx: mle.find.idx,
					err: mle.find.err 
					/*cellParms: JSON.stringify({
						mu: gmm.mu,
						sigma: gmm.sigma
					})*/
				});
			});
		}

		mles.each( function (n,mle) {
			delete mle._gaussian;
			delete mle._sinv;
		});
		
		//Log({mixes:JSON.stringify(obs)});
		res([obs]);  //ship it
	});
}

function genpr(ctx,res) {
/* 
Return random [ {x,y,...}, ...] for ctx parameters:
	Mix = [ {dims, offs}, .... ] = desired mixing parms
	TxPrs = [ [rate, ...], ... ] = (KxK) from-to state transition probs
	Symbols = [sym, ...] state symbols or null to generate
	Members = number in process ensemble
	Wiener = number of wiener processes; 0 disables
	Nyquist = process over-sampling factor
	Steps = number of process steps	
	Batch = batch size in steps
*/

	function randint(a) {
		return floor((rand() - 0.5)*2*a);
	}

	function scalevec(x,a) {
		for (var n=0;n<3; n++) x[n] *= a[n];
		return x;
	}

	function offsetvec(x,y) {
		for (var n=0; n<3; n++) x[n] += y[n];
		return x;
	}

	var 
		exp = Math.exp, log = Math.log, sqrt = Math.sqrt, floor = Math.floor, rand = Math.random;

	/*
	if (!Mix) Mix = [];
	
	else
	if (Mix.constructor == Object) {  // generate random gauss mixes
		var 
			K = Mix.K, 
			Mix = [],
			a = 0, 
			b = 0, and
			xx = 0.9, yy = 0.7, xy = yx = 0.4, zz = 0.1;

		for (var k=0; k<K; k++) 
			Mix.push({
				mu: [randint(a), randint(a), randint(a)],
				sigma: [[xx,xy,0],[yx,yy,0],[0,0,zz]]
			});
	} */

	Log("genpr ctx",ctx);
	
	var
		mvd = [], 	// multivariate distribution parms
		
		mix = ctx.Mix || {},
		mixing = ctx.Mix ? true : false,
		
		walking = ctx.Wiener ? true : false, // random walking		
		mode = mixing ? parseFloat(mix.theta) ? "oo" : mix.theta || "gm" : "na",  // Process mode

		mu0 = mix.mu,	// mean 
		sigma0 = mix.sigma,  // covariance
		theta0 = mix.theta,  	// oo time lag
		x0 = mix.x0, 		// oo initial pos
		ooW = [], // wiener/oo process look ahead
		
		a = {  // process fixed parms
			wi: 0,
			gm: 0,
			br: sigma0 * sigma0 / 2,
			oo: sigma0 / sqrt(2*theta0)
		},  		// sampler constants
		samplers = {  // reserved sampling methods when taking wiener walks
			na: function (u) {  // ignore
			},

			wi: function (u) {  // wiener (need to vectorize)
				var 
					t = ran.s, 
					Wt = ran.W[0];

				return mu0 + sigma0 * Wt;
			},

			oo: function (u) {  // ornstein-uhlenbeck (need to vectorize)
				var 
					t = ran.s, 
					Et = exp(-theta0*t),
					Et2 = exp(2*theta0*t),
					Wt = ooW[floor(Et2 - 1)] || 0;

				ooW.push( WQ[0] );

				return x0 
						? x0 * Et + mu*(1-Et) + a.oo * Et * Wt 
						: mu + a.oo * Et * Wt;
			},

			br: function (u) { // geometric brownian (need to vectorize)
				var 
					t = ran.s, 
					Wt = ran.WQ[0];

				return exp( (mu0-a.br)*t + sigma0*Wt );
			},

			gm: function (u) {  // mixed gaussian (vectorized)
				return mvd[u].sample();
			}
		},  // samplers
		labels = ["x","y","z"], // vector sample labels
		sampler = samplers[mode], // sampler
		states = ctx.TxPrs.length;

	//sigma = mix.sigma || [ [ scalevec([0.4, 0.3, 0],dims), scalevec([0.3, 0.8, 0],dims), scalevec([0, 0, 1],dims)] ],
		
	Log({mix:ctx.Mix,txprs:ctx.TxPrs,steps:ctx.Steps,batch:ctx.Batch, States:states}); //, mu:mus, sig:sigs});
		/*
		mix.each( function (k,mix) {  // scale mix mu,sigma to voxel dimensions
			//Log([k, floor(k / 20), k % 20, mix, dims]);

			offsetvec( scalevec( mix.mu, dims), [
				floor(k / 20) * dims[0] + Offsets[0],
				(k % 20) * dims[1] + Offsets[1],
				mix.mu[2] + Offsets[2]
			]);  
			//for (var i=0;i<mixdim; i++) scalevec( mix.sigma[i], dims );

			mvd.push( RAN.MVN( mix.mu, mix.sigma ) );
		});
		*/
	// [{"mu":[0,0,0],"sigma":[[0.9,0.4,0],[0.4,0.7,0],[0,0,0.1]]}, {"mu":[0.3,0.5,0], "sigma":[[0.8,0.2,0],[0.2,0.8,0],[0,0,0.1]]}]
	
	var ran = new RAN({ // configure the random process generator
		N: ctx.Members,  // ensemble size
		wiener: ctx.Wiener,  // wiener process steps
		trP: ctx.TxPrs, // state transition probs 
		symbols: ctx.Symbols,  // state symbols
		nyquist: ctx.Nyquist, // oversampling factor
		store: [], 	// provide an event store (forces a sync pipe) since we are running a web service
		steps: 20, //ctx.Steps, // process steps
		batch: ctx.Batch, // batch size in steps
		obs: {		// emission/observation parms
			weights: [1,1,1],  // lat,lon,alt
			parts: [0.5,0.5,0.1],
		},  
		filter: function (str, ev) {  // retain selected onEvent info
			switch ( ev.at ) {
				case "config":
					//Copy({mu: mus, sigma:sigs}, ev);
					Log(ev);
					str.push(ev);
					break;

				case "step":
					if (walking) {
						var ev = { 
								at: ev.at,
								t: ran.t,
								u: 0,
								n: 0
							};

						ran.WU.each(function (id, state) {
							ev[ labels[id] || ("w"+id) ] = state;
						});

						str.push(ev);
						//Log(ev);
					}

					else
						ran.U.each( function (id, state) {
							var ys = ran.Y[id];
							//Log(id,state,ran.Y.length, ys);
							str.push({ 
								at: ev.at,  // step name
								t: ran.t, // time sampled
								u: state,   // state occupied
								n: id, 	// unique identifier
								x: ys[0],  	// lat
								y: ys[1],  	// lon
								z: ys[2] 	// alt
							});
						});

					break;

				case "batch":
					str.push(ev);
					break;

				default:
					str.push(ev);
			}
			
		}  // on-event callbacks
	});
	
	ran.pipe( [], function (evs) {
		ctx.Save = evs;
		res( ctx );
	}); 
	
}

function estpr(ctx,res) {
/* 
Return MLEs for random event process [ {x,y,...}, ...] given ctx parameters:
	Job = { ... } event getter
	Symbols = [sym, ...] state symbols or null to generate
	Batch = batch size in steps
	Members = number of members participating in process
	States = number of states consumed by process
	Steps = number of time steps
*/

	var 
		Log = console.log,
		exp = Math.exp, log = Math.log, sqrt = Math.sqrt, floor = Math.floor, rand = Math.random;

	var 
		ran = new RAN({ // configure the random process generator
			N: ctx.Members,  // ensemble size
			wiener: 0,  // wiener process steps
			sym: ctx.Symbols,  // state symbols
			store: [], 	// use sync pipe() since we are running a web service
			steps: ctx.Steps, // process steps
			batch: ctx.Batch, // batch size in steps 
			K: ctx.States,	// number of states (realtime mode)
			events: ctx.Job,  // event getter (realtime mode)
			filter: function (str, ev) {  // retain selected onEvent info
				switch ( ev.at ) {
					case "end":
						str.push(ev);
				}
			}  // on-event callbacks
		});
	
	ran.pipe( [], function (evs) {
		ctx.Save = evs;
		res( ctx );
	}); 
	
}

// UNCLASSIFIED
