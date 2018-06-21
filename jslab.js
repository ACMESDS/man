// UNCLASSIFIED

/**
@class JSLAB
@requires crypto
@requires glwip
@requires liegroup 
@requires mathjs
@requires fft-js
@requires nodehmm
@requires node-svd
@requires jsbayes
@requires recurrentjs
@requires gamma
@requires expectation-maximization
@requires multivariate-normal
@requires newton-raphson
 
@requires enum
 */

var
	FS = require("fs"),
	ME = require("mathjs"),
	ENUM = require("enum"),
	DET = {
		train: function (ctx, res) { //< gen  detector-trainging ctx for client with callback to res(ctx) when completed.

			var detName = ctx._Plugin;

			LAB.thread( function (sql) {
				var vers = [0]; //ctx.Overhead ? [0,90] : [0];
				var labels = ctx.Labels.split(",");

				// train classifier
				//	`python ${ENV.CAFENGINES}/train`

				// train locator

				labels.each(function (n,label) {

					var posFilter = "digit +" + label,
						newFilter = "digit -" + label;

					sql.query(		// lock proofs
						"START TRANSACTION", 
						function (err) {	

					sql.query( 		// allocate positives to this ctx
						"UPDATE app.proofs SET ? WHERE ? AND ?",
						[{posLock:detName}, {cat:"digit"}, {label:label}],
					//	"UPDATE proofs SET ? WHERE MATCH (label) AGAINST (? IN BOOLEAN MODE) AND enabled",
					//	[{posLock:detName},posFilter], 
						function (err) {

					sql.query(		// allocate negatives to this ctx
						"UPDATE app.proofs SET ? WHERE ? AND NOT ?",
						[{negLock:detName}, {cat:"digit"}, {label:label}],
					//	"UPDATE proofs SET ? WHERE MATCH (label) AGAINST (? IN BOOLEAN MODE) AND enabled",
					//	[{negLock:detName},negFilter], 
						function (err) {

					sql.query(
						"SELECT * FROM app.proofs WHERE ? LIMIT 0,?",		// get allocated positives
						[{posLock:detName},ctx.MaxPos],
						function (err,posProofs) {

					sql.query(								// get allocated negatives
						"SELECT * FROM app.proofs WHERE ? LIMIT 0,?",
						[{negLock:detName},ctx.MaxNeg],
						function (err,negProofs) {

					sql.query(			// end proofs lock.
						"COMMIT", 
						function (err) { 

					Trace("PROOF ",[posProofs.length,negProofs.length], sql);

					if (posProofs.length && negProofs.length) {	// must have some proofs to execute ctx

						var	
							posDirty = posProofs.sum("dirty"),
							negDirty = negProofs.sum("dirty"),
							totDirty = posDirty + negDirty,
							totProofs = posProofs.length + negProofs.length,
							dirtyness = totDirty / totProofs;

						Trace('DIRTY', [dirtyness,ctx.MaxDirty,posDirty,negDirty,posProofs.length,negProofs.length], sql);

						sql.query("UPDATE detectors SET ? WHERE ?",[{Dirty:dirtyness},{ID:ctx.ID}]);

						if (dirtyness >= ctx.MaxDirty) {		// sufficiently dirty to cause ctx to execute ?

							sql.query("UPDATE proofs SET dirty=0 WHERE least(?)",{posLock:detName,negLock:detName});

							vers.each( function (n,ver) {  		// train all detector versions

								var det = FLEX.clone(ctx);

								det.Path = "det"+ver+"/"+label+"/"; 		// detector training results placed here
								det.DB = "../db"+ver;						// positives and negatives sourced from here relative to ENV.DETS
								det.posCount = posProofs.length;
								det.negCount = negProofs.length;
								det.posPath = det.Path + "positives.txt"; 	// + ENV.POSITIVES + (false ? jobFolder + ".positives" : det.PosCases + ".jpg");  		// .positives will disable auto-rotations
								det.negPath = det.Path + "negatives.txt"; 	// + ENV.NEGATIVES + jobFolder + ".negatives";
								det.vecPath = det.Path + "samples.vec";
								det.posLimit = Math.round(det.posCount * 0.9); 	// adjust counts so haar trainer does not exhaust supply
								det.negLimit = Math.round(det.negCount * 1.0);

								det.link = det.Name.tag("a",{href:"/swag.view?goto=Detectors"}) + " " + det.posLimit + " pos " + det.negLimit + " neg";
								det.name = det.Name;
								det.client = log.client;
								det.work = det.posCount + det.negCount;

								Trace(`TRAIN ${det.Name} v${ver}`, sql);

								var Execute = {
									Purge: "rm -rf " + det.Path,
									Reset: "mkdir -p " + det.Path,

									// ************* NOTE 
									// ****** Must pass bgcolor and bgthres as parms too - positive dependent
									// ****** so must be dervied from image upload tags
									Resample: 
										`opencv_createsamples -info ${det.posPath} -num ${det.posCount} -w ${det.Width} -h ${det.Height} -vec ${det.vecPath}`,
										//"opencv_createsamples -info $posPath -num $posCount -w $Width -h $Height -vec $Data/samples.vec",
										//"opencv_createsamples $Switch $posPath -bg $negPath -vec $Vector -num $Samples -w $Width -h $Height -bgcolor 112 -bgthresh 5 -maxxangle $xRotate -maxyangle $yRotate -maxzangle $zRotate -maxidev $ImageDev",

									Train: 
										`opencv_traincascade -data ${det.Path} -vec ${det.vecPath} -bg ${det.negPath} -numPos ${det.posLimit} -numNeg ${de.negLimit} -numStages ${det.MaxStages} -w ${det.Width} -h ${det.Height} -featureType LBP -mode BASIC`
										//"opencv_traincascade -data $Cascade -bg $negPath -vec $Vector -numPos $Positives -numNeg $Negatives -numStages $MaxStages -precalcValBufSize 100 -precalcIdxBufSize 100 -featureType HAAR -w $Width -h $Height -mode BASIC -minHitRate $MinTPR -maxFalseAlarmRate $MaxFPR -weightTrimRate $TrimRate -maxDepth $MaxDepth -maxWeakCount $MaxWeak"										
								};

								Trace((det.Execute||"").toUpperCase()+" "+det.name, sql);

								/**
								* Training requires:
								*  	SAMPLES >= POSITIVES + (MAXSTAGES - 1) * (1 - STAGEHITR) * POSITIVES + NEGATIVES
								* that is:
								*	POSITIVES <= (SAMPLES-NEGATIVES) / (1 + (MAXSTAGES-1)*(1-STAGEHITR))
								*
								* Actual STAGES (from training log) <= MAXSTAGES 
								* Desired HITRATE = STAGEHITR ^ MAXSTAGES --> STAGEHITR ^ (Actual STAGES)
								* Desired FALSEALARMRATE = STAGEFAR ^ MAXSTAGES --> STAGEFAR ^ (Actual STAGES)
								*
								* The samples_zfullN100 file will always contain $NEGATIVES number of negative images.
								*/

								switch (det.Execute.toLowerCase()) {
									case "purge": 
									case "clear":
										//sql.jobs().insert( "purge", Execute.Purge, det);
										break;

									case "reset":
									case "retrain":

										if (true) {						// gen training positives
											var list = []; 

											posProofs.each( function (n,proof) {
												//list.push(proof.Name + " 1 0 0 " + (proof.Width-1) + " " + (proof.Height-1) );
												list.push([det.DB+"/"+proof.name, 1, proof.left, proof.top, proof.width, proof.height].join(" "));
											});

											FS.writeFileSync(
												`./public/dets/${det.posPath}`, 
												list.join("\n")+"\n","utf-8");
										}

										if (true) {					 	// gen training negatives
											var list = [];

											negProofs.each( function (n,proof) {
												list.push(det.DB+"/"+proof.name);
											});

											FS.writeFileSync(
												`./public/dets/${det.negPath}`, 
												list.join("\n")+"\n","utf-8");
										}

										if (true)
											sql.jobs().insert( "reset", Execute.Reset, det, function () {
												sql.jobs().insert( "sample", Execute.Resample, det, function () {
													sql.jobs().insert( "learn", Execute.Train, det, function () {
														if (res) res(det);
													});
												});
											});

										break;

									case "resample":

										sql.jobs().insert( "sample", Execute.Resample, det, function () {
											sql.jobs().insert( "learn", Execute.Train, det, function () {
												if (res) res(det);
											});
										});
										break;

									case "transfer":

										sql.jobs().insert( "learn", Execute.Train, det, function () {
											if (res) res(det);
										});
										break;

									case "baseline":
										break;

									case "run":
									case "detect":

										if (FLEX.HACK)
										FLEX.HACK.workflow(sql, {
											detName: det.Name.replace(/ /g,"_"),
											chanName: det.Channel,
											size: det.Feature,
											pixels: det.Pixels,
											scale: det.Pack,
											step: det.SizeStep,
											detects: det.Hits,
											infile: det.infile,
											outfile: "/rroc/data/giat/swag/jobs",
											ctx: {
												client: req.client,
												class: "detect",
												name: det.Name,
												link: det.Name.tag("a",{href:"/swag.view?goto=Detectors"}),
												qos: req.profile.QoS,
												priority: 1
											}									
										});

										break;
								}

							});

						}
					}

					}); // commit proofs
					}); // select neg proofs
					}); // select pos proofs
					}); // update neg proofs
					}); // update pos proofs
					}); // lock proofs

				});	// labels
			}); ///sql thread
		}
	},
	LWIP = require('glwip'),
	CRYPTO = require('crypto'),
	MLE = require("expectation-maximization"),
	MVN = require("multivariate-normal"),
	LM = require("./mljs/node_modules/ml-levenberg-marquardt"),
	LAS = require("./mljs/node_modules/ml-matrix"),
	ME = require('mathjs'),
	GAMMA = require("gamma"),
	DSP = require("fft-js"),
	//HACK: require("geohack"),
	//RAN: require("randpr"),  // added by debe to avoid recursive requires
	//SVD: require("node-svd"),
	//RNN: require("recurrentjs"),
	BAYES = require("jsbayes"),
	HMM = require("nodehmm"),
	ZETA = require("riemann-zeta"),
	NRAP = require("newton-raphson");

//console.log("jslab las=", LAS);

[
	function use(cb) {	// use vector A with callback cb(idx,A)
		var A = this, N = A.length;

		if (A.rows) {
			var M = A.rows, N = A.columns;

			for (var m=0; m<M; m++) for (var n=0, Am = A[m]; n<N; n++) cb(m,n,A,Am);
			return A;
		}

		else
			for (var n=0,N=A.length; n<N; n++) cb(n,A);

		return A;
	}	
].extend(Array);

const { Copy,Each,Log } = ENUM;

var LAB = module.exports = {  
	libs: {  // libraries made available to plugin context
		ME: ME,
		JSON: JSON,
		LWIP: LWIP,
		CRYPTO: CRYPTO,
		
		// basic enumerators
		Copy: Copy,
		Each: Each,
		Log: Log,
		console: console,
		
		// lightweight matrix and array creators
		$$: (M,N,cb) => {  // create matrix A with callback cb(m,n,A,A[m])
			var A = new Array(M);

			A.rows = M;
			A.columns = N;
			for (var m=0; m<M; m++) A[m] = new Array(N);

			return cb ? A.use(cb) : A;
		},

		$: (N,cb) => {  // create vector A with callback cb(idx,A)
			var A = new Array(N);
			return cb ? A.use(cb) : A;
		},
		
		// following should be removed when plugins rely only on ME
		LAS: LAS,
		MLE: MLE,
		MVN: MVN,
		LM: LM,
		GAMMA: GAMMA,
		
		FLOW: {  // event workflowers
		/**
		Each event-plugin interface FLOW = batch | each | all |  none will flow an ingested
		event stream ievs (specified by the plugin's context ctx.Events to a cb(ievs,sink) callback, 
		where the sink(oevs) provided by the interface will save an output event list oevs to the plugin's
		context.
		
			FLOW(ctx, function cb(ievs, sink) {  // sink the plugin's ingested ievs
				if (ievs) 
					ievs.forEach( ev) { // process input event ev
					});
				
				else 
					sink([ {...}, {...} ]);  // respond with oevs to be saved by the plugin  
			});
		*/
		
			batch: function (ctx, cb) {
				LOAD( ctx.Events, ctx, cb, function (ctx,rec,recs) { 
					return recs.length ? rec.t > recs[0].t : false;
				});
			},
			each: function (ctx, cb) {
				LOAD( ctx.Events, ctx, cb, function (ctx,rec,recs) {
					return recs.length < 1;
				});
			},
			all: function (ctx, cb) {
				LOAD( ctx.Events, ctx, cb, function (ctx,rec,recs) { 
					return false;
				});
			},
			none: function (ctx, cb) {
				LOAD( ctx.Events, ctx, cb, function (ctx,rec,recs) { 
					return true;
				});
			}
		},
		
		// event loader and saver
		
		LOAD: function (evs, ctx, cb, groupcb) {  // load events evs (query or list) using cb(evs,null) then cb(null,savecb) at end

			function feedEvents(evs, cb) {  // feed evs event buffer to callback cb(evs) then flush the buffer
				//Log("flushing",evs.length);
				if (evs.length) cb( evs );
				evs.length = 0;
			}
			
			function saveEvents(evs) {  // save evs buffer to plugin's context
				SAVE( evs, ctx );
			}
			
			if (evs)
				LAB.thread( function (sql) {  
					if ( evs.constructor == String ) {  // pull event records from db using supplied evs query
						var recs = [];

						if ( groupcb )  // feed grouped events
							sql.forEach( "GET", evs , [], function (rec) {  // feed db events to grouper
								if ( groupcb(ctx, rec, recs) ) feedEvents(recs, cb);
								recs.push(rec);
							}).onEnd( function () {
								feedEvents(recs, cb);
								cb( null, saveEvents );   // signal end-of-events
							});

						else
							sql.forAll( "GET", evs, [], function (recs) {  // feed all db events w/o a grouper
								feedEvents(recs, cb);
								cb( null, saveEvents );  // signal end-of-events
							});
					}

					else {  // pull event recs from supplied using supplied evs list
						if ( groupcb ) {
							var recs = [];			
							evs.forEach( function (rec) { // feed recs
								if ( groupcb(ctx, rec, recs) ) feed(recs, cb);
								recs.push(rec);
							});
							feedEvents( recs, cb );
							cb( null, saveEvents );   // signal end-of-events
						}

						else {
							feedEvents(evs, cb);
							cb( null, saveEvents );   // signal end-of-events
						}
					}
				});
		},		
		
		SAVE: function ( evs, ctx, cb ) {  // save evs to host plugin Save_KEY with callback(remainder evs) 

			function saveKey( sql, key, save, ID, host ) {				
				sql.query(
					`UPDATE ?? SET ${key}=? WHERE ID=?`, 
					[host, JSON.stringify(save) || "null", ID], 
					function (err) {
						Trace(err ? `DROP ${host}.${key}` : `SAVE ${host}.${key}` );
				});
			}

			function updateFile( sql, file, stats ) {
				stats.forEach( function (stat) {
					var save = {}, set=false;
					Each( stat, function (idx, val) {
						if ( idx in file) {
							save[ set = idx] = (typeof val == "object") 
								? JSON.stringify( val )
								: val;
						}
					});

					if (set)
						sql.query(
							"UPDATE app.files SET ? WHERE ?",
							  [save, {ID: file.ID}],
							(err) => Log( err || "UPDATE "+file.Name)
						);
				});
			}
			
			function updateStats( sql, fileID, voxelID, stats ) {  // save relevant stats 
				var saveKeys = LAB.saveKeys;
				
				stats.forEach( function (stat) {
					var save = {}, set=false;
					Each( stat, function (key, val) {
						if ( key in saveKeys) 
							save[ set = key] = (typeof val == "object") 
								? JSON.stringify( val )
								: val;
					});

					if (set) 
						if (true) {
							save.fileID = fileID;
							save.voxelID = voxelID;					
							sql.query(
								"INSERT INTO app.stats SET ? ON DUPLICATE KEY UPDATE ?",
								  [save, save],
								(err) => Log( "STATS " + (err ? "FAILED" : "UPDATED") )
							);
						}
						
						else
							sql.query( "UPDATE app.files SET ? WHERE ?", [save, {ID: fileID}] );
							
				});
			}

			//Log("save host", ctx.Host);

			if (evs) {
				LAB.thread( function (sql) {
					var 
						stash = { };  // ingestable keys stash

					switch (evs.constructor.name) {
						case "Error": 
							return evs+"";

						case "Array":   // keys in the plugin context are used to create save stashes
							var 
								stash = { remainder: [] },  // stash for aggregated keys 
								rem = stash.remainder;

							Array.from(evs).stashify("at", "Save_", ctx, stash, function (ev, stat) {  // add {at:"KEY",...} evs to the Save_KEY stash

								if (ev)
									try {
										for (var key in stat) ev[key].push( stat[key] );
									}
									catch (err) {
										ev[key] = [ stat[key] ];
									}

								else {
									var ev = new Object();
									for (var key in stat) ev[key] = [ ];
									return ev;
								}

							});

							if (rem.length) {  // there is a remainder to save
								if (cb) cb(rem, sql);

								saveKey(sql, "Save", rem, ctx.ID, ctx.Host);
							}

							delete stash.remainder;	
							break;

						case "Object":  // keys in the plugin context are used to create the stash
							var stash = {};
							Each(evs, function (key, val) {  // remove splits from bulk save
								if ( key in ctx ) stash[key] = val;
							});
							break;
					}

					if ( stash.Save_end ) 
						if ( stats = stash.Save_end.stats ) {   // there are stats that may need to be updated
							var
								file = ctx.File || {ID: 0},
								voxel = ctx.Voxel || {ID: 0};

							updateStats(sql, file.ID, voxel.ID, stats);
						}

						/*
						if ( File = ctx.File )
							updateFile( sql, File, stats);

						else
							sql.forFirst( "", "SELECT * FROM app.files WHERE ? LIMIT 1", {Name: ctx.Host+"."+ctx.Name}, function (File) {
								if (File) 
									updateFile(sql, File, stats);
							});
							*/

					for (var key in stash) 
						saveKey(sql, key, stash[key], ctx.ID, ctx.Host);
				});
			
				return ctx.Share ? evs : ("updated").tag("a",{href: "/files.view"});
			}
			
			else
				return "empty";

		}

	},
	
	fetcher: () => Trace("data fetcher not configured"), //< data fetcher
	thread: () => Trace("sql thread not configured"), //< sql threader
	
	saveKeys: { //< reserved for plugin save-keys determined at config
	},
		
	config: function (opts, cb) {
		if (opts) Copy(opts, LAB, ".");

		var
			saveKeys = LAB.saveKeys;

		LAB.thread( function (sql) {
	
			sql.getFields("app.stats", null, [], function (keys) {
				keys.forEach(function (key) {
					saveKeys[key] = true;
				});
			});
	
		});

		if (cb) cb(null);	
	}
	
};

//=========== Extend matlab emulator

var 
	LIBS = LAB.libs,
	LOAD = LIBS.LOAD,
	SAVE = LIBS.SAVE;

const { $, $$ } = LIBS;
const {random, sin, cos, exp, log, PI, floor, abs} = Math;

ME.import({
	exec: function (code,ctx,cb) {
		var vmctx = {};

		for (key in ctx) {
			val = ctx[key];
			vmctx[key] = (val && val.constructor == Array) 
					? vmctx[key] = ME.matrix(val)
					: val;
		}

		ME.eval(code, vmctx);

		for (key in vmctx) {
			val = vmctx[key];
			vmctx[key] = (val && val._data)
				? val._data
				: val;
		}
		
		if (cb) cb(vmctx);
	},
		
	isEqual: function (a,b) {
		return a==b;
	},
	
	svd: function (a) {
		var svd = new LAS.SVD( a._data );
		Log(svd);
	},
	
	evd: function (a) {
		var evd = new LAS.EVD( a._data );  //, {assumeSymmetric: true}
		return {
			values: ME.matrix(evd.d), 
			vectors: ME.matrix(evd.V)
		}; 
	},
	
	rng: function (min,max,N) { 
		var
			del = (max-min) / (N-1);
		
		return ME.matrix( $( N, (n,R) => { R[n] = min; min+=del; } ) );
	},

	xmatrix: function ( xccf ) { 
	/* 
	return N x N complex corr matrix Xccf [unitless] given its 2N+1 dim complex corr function xccf [unitless].
	*/
		
		var 
			xccf = xccf._data,
			N = xccf.length,   	//  eg N = 9 = 2*(5-1) + 1
			N0 = floor( (N+1)/2 ),		// eg N0 = 5
			M0 = floor( (N0-1)/2 ),		// eq M0 = 2 for 5x5 Xccf
			K0 = N0-1,	// 0-based index to 0-lag
			Xccf = $$( N0, N0, (m,n,X) => X[m][n] = 0 );

		Log("xmatrix",N,N0,M0);
		
		for (var n = -M0; n<=M0; n++) 
			for (var m = -M0; m<=M0; m++) {
				var k = m - n;
				Xccf[m+M0][n+M0] = xccf[ k+K0 ];
				//Log(n,m,k);
			}
		
		//Log(Xccf);
		return ME.matrix( Xccf );
	},
	
	sinc: function (x) {
		var x = x._data, N = x.length;
		return ME.matrix( $( N, (n, sinc) => sinc[n] = x[n] ? sin( PI*x[n] ) / (PI*x[n]) : 1) );
	},
	
	rect: function (x) {
		var x = x._data, N = x.length;
		return ME.matrix( $( N, (n, rect) => rect[n] = (abs(x[n])<=0.5) ? 1 : 0) );
	},

	tri: function (x) {
		var x = x._data, N = x.length;
		return ME.matrix( $( N, (n, tri) => tri[n] = (abs(x[n])<=1) ? 1-x[n] : 0) );
	},
	
	negexp: function (x) {
		var x = x._data, N = x.length;
		return ME.matrix( $( N, (n, neg) => neg[n] = (x[n] > 0) ? exp(-x[n]) : 0) );
	},
		
	lorenzian: function (x) {
		var x = x._data, N = x.length;
		return ME.matrix( $( N, (n, lor) => lor[n] = 2 / (1 + (2*pi*x[n]**2)) ));
	},
	
	dht: function (f) {  // discrete Hilbert transform
		var 
			f = f._data, 
			N = f.length, 
			a = 2/Math.PI, 
			N0 = floor( (N-1)/2 ),   // 0-based index to 0-lag
			isOdd = N0 % 2, isEven = isOdd ? 0 : 1;
		
		return ME.matrix( $(N, (n,g) => { 
			var n0 = n - N0;
			if ( n0 % 2) // odd n so use even k 
				for (var sum=0,k=isOdd, k0=k-N0; k<N; k+=2,k0+=2) sum += f[k] / (n0 - k0); // Log( n0, k0, f[k], n0-k0, sum += f[k] / (n0 - k0) );  //
			
			else  // even n so use odd k
				for (var sum=0,k=isEven, k0=k-N0; k<N; k+=2,k0+=2) sum += f[k] / (n0 - k0); // Log( n0, k0, f[k], n0-k0, sum += f[k] / (n0 - k0) );
		
			g[n] = a*sum;
		}) );
	},
		
	pwrem: function (nu, z) {
	// paley-weiner remainder given zeros z in complex UHP
		var 
			z = z._data,
			N = z.length,
			ctx = {
				nu: nu,
				rem: ME.matrix( $( nu._data.length, (n,R) => R[n] = 0 ) )
			};
		
		for (var n=0; n<N; n++) {
			ctx.z = z[n];
			ME.eval("rem = rem + arg( (nu - z) ./ (nu - conj(z)) );", ctx);
		}
		
		return ctx.rem;
	},
	
	pwt: function (modH, z) { 
	// paley-weiner recovery of H(nu) = |H(nu)| exp( j*argH(nu) ) given its zeros z=[z1,...] in complex UHP
		
		var 
			N = modH._data.length,
			ctx = {
				N: N, 
				modH: modH, 
				z: z
			};

		ME.eval( "nu = rng(-fs/2, fs/2, N); argH = dht( log( modH ) ) + pwrem(nu, z); ", ctx ); 
		return ctx.argH;
	},
	
	dft: function (F) {
		
		var 
			F = F._data,
			N = F.length,
			isReal = F[0].constructor == Number,
			G = $( N-1, (n,G) => {  // alt signs to setup dft and trunc array to N-1 = 2^int
				var Fn = F[n];
				G[n] = (n % 2) 	
					? isReal ? [-Fn, 0] : [-Fn.re, -Fn.im] 
					: isReal ? [Fn,0] : [Fn.re, Fn.im];
			}),
			g = DSP.ifft(G);

		g.use( (n) => {  // alt signs to complete dft 
			var gn = g[n];
			g[n] = (n % 2) ? ME.complex(-gn[0], -gn[1]) : ME.complex(gn[0], gn[1]);
		});

		g.push( ME.complex(0,0) );
		return ME.matrix(g);
	},
	
	wkpsd: function (ccf, T) {  
	/* 
	return weiner-kinchine psd [Hz] at frequencies nu [Hz] = [-f0 ... +f0] of a complex corr func 
	ccf [Hz^2] of len N = 2^K + 1 defined overan interval T [1/Hz], where the cutoff f0 is 1/2 the implied
	sampling rate N/T.
	*/
		var 
			ccf = ccf._data,
			ctx = {
				N: ccf.length,
				T: T,
				ccf: ME.matrix(ccf)  // [Hz^2]
			};

		ME.eval( `
N0 = fix( (N+1)/2 );
fs = (N-1)/T;
f0 = fs/2;
df = fs/N;
psd = abs(dft( ccf )); psd = psd * ccf[N0] / sum(psd) / df; 
`, ctx);
		return ctx.psd;
	},
		  
	psd: function (t,nu,T) {  
	/*
	return power spectral density [Hz] of events at times [t1,t2,...] over interval T [1/Hz] at the
	specified frequencies nu [Hz].
	*/
		var
			t = t._data,
			K = t.length,
			ctx = {
				T: T,
				K: K,
				dt: T/N,
				s: ME.eval("i*2*pi*nu", {nu: nu}),
				Gu: 0
			};
		
		for (var i=0; i<K; i++) 
			for (var j=0; j<K; j++) {
				ctx.ti = t[i],
				ctx.tj = t[j];
				
				//if ( abs( ti - tj ) < T/2 ) 
				ME.eval("Gu = Gu + exp( s*(ti-tj) )", ctx);
			}
		
		ME.eval("Gu = Gu/T", ctx);
		return ctx.Gu;
	},

	evpsd: function (evs,nu,T,idKey,tKey) {
	/* 
	return psd [Hz] at the specified frequencies nu [Hz], and te mean event rate [Hz] given 
	events [{tKey: t1,idKey: id}, {tKey: t2, idKey: id}, ... ] over an observation interval  T [1/Hz].
	*/
		
		var
			evs = evs._data.sort( function (a,b) {
				return ( a[idKey] > b[idKey] ) ? 1 : -1;
			}),
			ctx = {
				T: T,
				nu: nu,
				Gu: 0,
				Ks: []
			},
			Ks = ctx.Ks;
		
		for (var ids=0, N=evs.length, n=0; n<N; ids++) {
			var 
				t = ctx.t = ME.matrix([]), 
				t = t._data,
				ev = evs[n], 
				id = ctx.id = ev[idKey], K = 0;
			
			while ( ev && ev[idKey] == id ) {
				t.push( ev[tKey] );
				ev = evs[++n];
				K++;
			}
			Log( id, K );
			Ks.push(K);
			ME.eval(" Gu = Gu + psd(t, nu, T) ", ctx);
		}
		ctx.ids = ids;
		Log("evpsd ids=", ctx.ids);
		return ME.eval(" {psd: re(Gu)/ids, rate:  mean(Ks)/T } ", ctx); 
	},
	
	udev: function (N,a) {  // uniform random deviate on [0...a]
		return ME.matrix( $(N, (n,R) => R[n] = a*random() ) );
	},
	
	expdev: function (N,a) {  // exp random deviate with mean a
		return ME.eval( "-a*log( udev(N,1) )" , {a:a, N:N} );
	},

	cumsum: function (x) {
		var
			x = x._data,
			N = x.length;
		
		return ME.matrix( $(N, (n,X) => X[n] = n ? X[n-1] + x[n] : x[0] ) );
	},
						 
	zeta: function (a) {},
	bayinfer: function (a) {},
	va: function (a) {},
	mle: function (a) {},
	mvn: function (a) {},
	lfa: function (a) {},
	lma: function (a) {},
	rnn: function (a) {},
	
	disp: function (a) {
		if (a.constructor == Object)
			for (var key in a) {
				var val = a[key];
				Log(key, val._data ? val._data : val);
			}
		
		else
			Log( a._data ? a._data : a );
	}
});

function Trace(msg,sql) {
	msg.trace("L>",sql);
}

//===================== unit testing

function _logp0(a,k,x) {  // for case 6.x testing
	var
		ax1 =  1 + a/x,
		xa1 = 1 + x/a,
		logGx = GAMMA.log(x),
		logGkx = GAMMA.log(k+x), 
		logGk1 = GAMMA.log(k+1),
		//logGx = logGamma[ floor(x) ],
		//logGkx = logGamma[ floor(k + x) ],
		//logGk1 = logGamma[ floor(k + 1) ],
		logp0 = logGkx - logGk1 - logGx  - k*log(xa1) - x*log(ax1);

	Log(a,k,x, logp0);
	return logp0;
}

switch (0) {
	case 1:
		ME.eval( "disp( dht( [0,1,2,1,0] ) )" );
		break;
		
	case 2.1:
		ME.eval( "disp( dht( [0,0,0,1e99,0,0,0] ) )" );
		break;
		
	case 2.2:
		ME.eval( "disp( dht(dht( [0,0,0,1e99,0,0,0] )) )" );
		break;
		
	case 2.3:  // sinc(x) = sin(x)/x =>  (1 - cos(x)) / x
		//ME.eval( "disp( rng(-pi,pi,21) )" );
		//ME.eval( "disp( sinc( rng(-pi,pi,21) ) )" );
		ME.eval( "disp( dht( sinc( rng(-pi,pi,21) ) ) )" );
		break;
		
	case 2.4:  // dht(dht(f)) => -f  tho there is a dt missing somewhere in this argument
		ME.eval( "disp( dht( dht( rng(-1,1,51)  ) ) )" );
		//ME.eval( "disp( dht( dht( sinc( -pi:(2*pi)/20:pi ) ) ) )" );
		break;

	case 3:
		ME.eval( " disp( pwt( abs(sinc( rng(-4*pi,4*pi,511)) ) , [] ) )" );
		break;
		
	case 4.1:
		var 
			evs = [],
			M = 50,
			ctx = {
				N:65, t0: 0.2, evs: ME.matrix( evs )
			};
		
		//ME.eval(" disp( urand(10,1) )");
		//ME.eval(" disp( expdev(5,1) )");
		//ME.eval(" disp( psd( udev(100,T), rng(-pi, pi, N) )/T )", {T:T, N:N});
		//ME.eval(" disp( cumsum( [1,2,3,4] ) )" );
		//ME.eval(" disp( psd( t, nu,T ) )", ctx);

		for (var m=0; m<M; m++) {
			ME.eval("lambda0 = 1/t0; t = cumsum(expdev(100, t0)); T = max(t); K0 = lambda0 * T; fs=(N-1)/T; nu = rng(-fs/2, fs/2, N); ", ctx);
			Log(ctx.K0, ctx.T, ctx.lambda0, ctx.K0/ctx.T)

			var 
				t = ctx.t._data,
				N = t.length;

			for (var n=0; n<N; n++) evs.push({t: t[n], id:m });
		}
		
		ME.eval(' Gu = evpsd(evs, nu, T, "id", "t") ', ctx);
		for (var nu = ctx.nu._data,	Gu = ctx.Gu._data, N=ctx.N, n=0; n<N; n++)  Log(nu[n].toFixed(4), Gu[n].toFixed(4));
					
		break;
		
	case 4.2:
		var ctx = {};
		ME.eval(" N=17; T=1; fs = (N-1)/T; nu = rng(-fs/2,fs/2,N); Gu = wkpsd([0,0,0,0,0,1,2,3,4,3,2,1,0,0,0,0,0], T); df = fs/(N-1); Pu = sum(Gu)*df; Xu = xmatrix(Gu); " , ctx); 
		Log("power check", ctx.Pu);
		// tri(t/t0), fs = 16; t0 = 4/fs -> 0.25; sinc^2(nu*t0) has zero at nu= +/- 4, +/- 8, ....
		
		//ME.eval(" N=9; T=1; fs = (N-1)/T; nu = rng(-fs/2,fs/2,N); Gu = wkpsd([0,0,0,1,2,1,0,0,0], T); Xu = xmatrix(Gu); " , ctx); 
		// tri(t/t0), fs = 8; t0 = 2/fs = 0.25; sinc^2(nu*t0) has zero at nu= +/- 4, ...

		//Log(ctx);
		for (var nu = ctx.nu._data,	Gu = ctx.Gu._data, n=0; n<ctx.N; n++)  Log(nu[n].toFixed(4), Gu[n].toFixed(4));
		//Log(ctx.Xu._data);
		break;
		
	case 6.1:  // LMA/LFA convergence
		
		function sinFunction([a, b]) {
		  return (t) => a * Math.sin(b * t);
		}
		
		function quadFunction([a, b]) {
			Log(a,b);
		  return (t) => a + b * t**2;
		}

		var len = 20;
		var data = {
		  x: new Array(len),
		  y: new Array(len)
		};
		var sampleFunction = quadFunction([2, 4]);
		var sampleFunction2 = quadFunction([2, 4.1]);
		for (var i = 0; i < len; i++) {
		  data.x[i] = i;
		  data.y[i] = (i % 2) ? sampleFunction(i) : sampleFunction(i);
		}
		var options = {
			damping: 0.1,
			maxIterations: 1e2,
			//gradientDifference: 1,
			initialValues: [-3, 16]
		};

		var ans = LM(data, quadFunction, options);
		Log(ans);	
		break;
		
	case 6.2:
		var len = 150,x = 75, a = 36;
		
		var logGamma = $(len*2 , (k, logG) =>
			logG[k] = (k<3) ? 0 : GAMMA.log(k)
		);
		
		var p0map = function ([a]) {
			 Log(a,x);
			return (k) => _logp0(a,k,x);
		};
		var data = {
		  x: new Array(len),
		  y: new Array(len)
		};
		var sampleFunction = p0map([75]);
		for (var i = 0; i < len; i++) {
		  data.x[i] = i;
		  data.y[i] = sampleFunction(i) ;
		}
		var options = {
		  damping: 0.1,
		//gradientDifference: 1,	
		maxIterations: 1e1,
		  initialValues: [120]
		};

		var ans = LM(data, p0map, options);
		Log(ans);	
		break;	
		
	case 6.3:
		var len = 150,x = 75, a = 36;
		
		var logGamma = $(len*2 , (k, logG) =>
			logG[k] = (k<3) ? 0 : GAMMA.log(k)
		);
		
		var p0map = function ([a,x]) {
			 Log(a,x);
			return (k) => _logp0(a,k,x);
		};
		var data = {
		  x: new Array(len),
		  y: new Array(len)
		};
		var sampleFunction = p0map([36,75]);
		for (var i = 0; i < len; i++) {
		  data.x[i] = i;
		  data.y[i] = sampleFunction(i) ;
		}
		var options = {
		  damping: 0.1,
		//gradientDifference: 1,	
		maxIterations: 1e1,
		  initialValues: [15,120]
		};

		var ans = LM(data, p0map, options);
		Log(ans);	
		break;
		
}

// UNCLASSIFIED
