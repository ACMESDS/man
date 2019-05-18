// UNCLASSIFIED

/**
@class man

@requires crypto
@requires glwip
@requires enum
@requires liegroup 
@requires mathjs
@requires fft-js
@requires nodehmm
@requires node-svd
@requires node-svm
@requires mljs
@requires jsbayes
@requires recurrentjs
@requires gamma
@requires expectation-maximization
@requires multivariate-normal
@requires newton-raphson
*/

const { Copy,Each,Log,isArray,isNumber,isString,isObject } = require("enum");

const {random, sin, cos, exp, log, PI, floor, abs, min, max} = Math;

function groupEvents (rec,recs) { 
	return recs.length ? rec.t > recs[0].t : false;
}

function feedEvents (evs, cb) {  // feed evs event buffer to callback cb(evs) then flush the buffer
	//Log("feed ",evs.length);
	if (evs.length) cb( evs );
	evs.length = 0;
}

function saveStash(sql, stash, ID, host) {
	function saveKey( sql, key, save ) {				
		sql.query(
			`UPDATE app.?? SET ${key}=? WHERE ID=?`, 
			[host, JSON.stringify(save) || "null", ID], 
			function (err) {  // will fail if key does not exist or mysql server buffer too small (see my.cnf)
				Trace(err ? `DROP ${host}.${key}` : `SAVE ${host}.${key}` );
				//Log(err);
		});
	}

	for (var key in stash) 
		saveKey( sql, key, stash[key] );
}
		 
[ 
	function get(grouping, cb) { // get event records from db using supplied query
		var query = this+"";
		
		//Log(">>>>fetching", query);
		$.thread( (sql) => {  
			var recs = [];

			if ( grouping )  // feed grouped events
				sql.forEach( TRACE, query , [], function (rec) {  // feed db events to grouper
					if ( groupEvents(rec, recs) ) feedEvents(recs, cb);
					recs.push(rec);
				})
				.on("end", () => {
					feedEvents(recs, cb);
					cb( null );   // signal end-of-events
				});

			else
				sql.forAll( TRACE, query, [], function (recs) {  // feed all db events w/o a grouper
					feedEvents(recs, cb);
					cb( null );  // signal end-of-events
				});

			sql.release();	
		});
	},
	
	function put(ctx,cb) {
		var stash = {}, rem = {};
		$.thread( (sql) => {
			Each(ctx, (key,val) => {
				if ( key.indexOf("Save_") == 0 )
					stash[key] = val;
				else
					rem[key] = val;
			});
			saveStash( sql, stash, ctx.ID, ctx.Host );
			cb( rem, sql );
		});
		
	},
	
	function $(ctx, cb) {
		if (cb) // load/save data
			if ( isString(ctx) )
				return this.get(ctx, cb);
		
			else
				return this.put(ctx,cb);

		else
			return null;
	}	
	
].extend(String);
	
[
	function get( style, cb) {  
	// thread events evs with style to callback cb(evs) if fetched or cb(null) if at end
		
		var evs = this;
		
		switch (style) {
			case "group":
				var recs = [];			
				evs.forEach( function (rec) { // feed recs
					if ( groupEvents(rec, recs) ) feedEvents(recs, cb);
					recs.push(rec);
				});
				feedEvents( recs, cb );
				cb( null );   // signal end-of-events
				break;
				
			case "":
			case "all":
			default:
				feedEvents(evs, cb);
				cb( null );   // signal end-of-events
		}
	},		
	
	function put( ctx, cb ) {
	// stash aggregated events evs into context ctx[ Save_KEYs ] then callback(unsaved evs) 

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
			var saveKeys = $.saveKeys;

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
							"INSERT INTO app._stats SET ? ON DUPLICATE KEY UPDATE ?",
							  [save, save] 
							// , (err) => Log( "STATS " + (err ? "FAILED" : "UPDATED") )
						);
					}

					else
						sql.query( "UPDATE app.files SET ? WHERE ?", [save, {ID: fileID}] );

			});
		}

		//Log("save host", ctx.Host);

		var evs = this;
		
		$.thread( (sql) => {
			var 
				stash = { remainder: [] },  // stash for aggregated keys 
				rem = stash.remainder;

			evs.stashify("at", "Save_", ctx, stash, function (ev, stat) {  // add {at:"KEY",...} evs to the Save_KEY stash

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

			saveStash(sql, stash, ctx.ID, ctx.Host);

			sql.release();
		});

		return ctx.Share ? evs : ("updated").tag("a",{href: "/files.view"});

	},
	
	function $(ctx, cb) {	// index matrix A, load/save data A
		if (cb) // load/save data
			if ( isString(ctx) )
				return this.get(ctx, cb);
			
			else
				return this.put(ctx, cb);
					
		else  {	// index matrix A with callback cb(idx, ..., A)
			var 
				cb = ctx,
				A = this, 
				N = A.length;		
			
			if (A.rows) {
				var M = A.rows, N = A.columns;

				for (var m=0; m<M; m++) for (var n=0, Am = A[m]; n<N; n++) cb(m,n,A,Am);
				return A;
			}

			else {
				for (var n=0,N=A.length; n<N; n++) cb(n,A);
				return A;
			}
		}
	}	
].extend(Array);

var $ = MAN = module.exports = function $(code,ctx,cb) {
	switch (code.constructor) {
		case String:
			if (cb) {
				var vmctx = {};

				for (key in ctx) {
					val = ctx[key];
					vmctx[key] = (val && isArray(val) )
							? vmctx[key] = $.matrix(val)
							: val;
				}

				$.eval(code, vmctx);

				for (key in vmctx) {
					val = vmctx[key];
					vmctx[key] = (val && val._data)
						? val._data
						: val;
				}

				cb(vmctx);
			}
			
			else
				return $.eval(code, ctx || {} );
			
			break;
			
		case Number:
			var 
				N = code,
				cb = ctx,
				A = new Array(N);
			
			return cb ? A.$(cb) : A;
			
		case Array:
			var
				dims = code,
				M = dims[0] || 0,
				N = dims[1] || 0,
				cb = ctx,
				A = new Array(M);

			A.rows = M;
			A.columns = N;
			for (var m=0; m<M; m++) A[m] = new Array(N);

			return cb ? A.$(cb) : A;
			
		case Object:
			if (task = ctx)
				$.tasker( code, task, cb );
			
			else
				$.import(code);
			
			break;
	}
}

Copy( require("mathjs"), $ );

var
	// globals
	TRACE = "$>",

	// node modules
	FS = require("fs"),
		
	// 3rd party modules
	DET= {
		train: function (ctx, res) { //< gen  detector-trainging ctx for client with callback to res(ctx) when completed.

			var detName = ctx._Plugin;

			$.thread( function (sql) {
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

					Log("PROOF ",[posProofs.length,negProofs.length]);

					if (posProofs.length && negProofs.length) {	// must have some proofs to execute ctx

						var	
							posDirty = posProofs.sum("dirty"),
							negDirty = negProofs.sum("dirty"),
							totDirty = posDirty + negDirty,
							totProofs = posProofs.length + negProofs.length,
							dirtyness = totDirty / totProofs;

						Log('DIRTY', [dirtyness,ctx.MaxDirty,posDirty,negDirty,posProofs.length,negProofs.length]);

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

								Trace(`TRAIN ${det.Name} ver ${ver}`, sql);

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
	CRYPTO = require('crypto'),
	LWIP = require('glwip'),
	EM = require("expectation-maximization"),
	MVN = require("multivariate-normal").default,
	LM = require("./mljs/node_modules/ml-levenberg-marquardt"),
	ML = require("./mljs/node_modules/ml-matrix"),
	LRM = require("./mljs/node_modules/ml-logistic-regression"),
	RAF = require("./mljs/node_modules/ml-random-forest"),
	DTR = require("./mljs/node_modules/ml-cart"),
	KNN = require("./mljs/node_modules/ml-knn"),
	MLR = require("./mljs/node_modules/ml-regression-multivariate-linear"),
	SPR = require("./mljs/node_modules/ml-regression-polynomial"),
	PLS = require("./mljs/node_modules/ml-pls"),
	SOM = require("./mljs/node_modules/ml-som"),
	SVM = require("node-svm"),
	GAMMA = require("gamma"),
	DSP = require("fft-js"),
	//RAN: require("randpr"),  // added by debe to avoid recursive requires
	//SVD: require("node-svd"),
	//RNN: require("recurrentjs"),
	BAYES = require("jsbayes"),
	HMM = require("nodehmm"),
	ZETA = require("riemann-zeta"),
	NRAP = require("newton-raphson"),
	ml$ = ML.Matrix;

//console.log("jslab las=", ML);

Copy({
	thread: () => Trace("sql threader not configured"), //< define on config

	tasker: () => Trace("tasker not configured"), //< define on config

	saveKeys: { //< define plugin save-keys on config
	},
	
	config: function (opts, cb) {
		if (opts) Copy(opts, $, ".");

		var
			saveKeys = $.saveKeys;

		$.thread( function (sql) {
	
			sql.getFields("app._stats", null, [], function (keys) {
				keys.forEach(function (key) {
					saveKeys[key] = true;
				});
			});
			sql.release();
		});

		if (cb) cb(null);	
	},
	
	JSON: JSON,
	LWIP: LWIP,
	CRYPTO: CRYPTO,
	LRM: LRM,
	SVM: SVM,
	KNN: KNN,
	SPR: SPR,
	MLR: MLR,		
	SOM: SOM,
	PLS: PLS,
	EM: EM,
	RAF: RAF,
	DTR: DTR,
	MVN: MVN,
	LM: LM,
	GAMMA: GAMMA,

	// basic enumerators
	Copy: Copy,
	Each: Each,
	Log: Log,
	console: console

}, $);

//=========== Extend mathjs emulator

$.import({
	// regressors
	
	dtr_train: function (x,y,solve,cb) {
		var
			X = x._data,
			Y = y._data,
			cls = new $.DTR.DecisionTreeRegression({
			  gainFunction: 'gini',
			  maxDepth: 10,
			  minNumSamples: 3
			});

		X.$( (n,x) => x[n] = x[n][0] );
		cls.train(X,Y);
		if (cb) cb(cls);
		return cls;
	},

	dtr_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	raf_train: function (x,y,solve,cb) {
		/*
		var dataset = [
  [73, 80, 75, 152],
  [93, 88, 93, 185],
  [89, 91, 90, 180],
  [96, 98, 100, 196],
  [73, 66, 70, 142],
  [53, 46, 55, 101],
  [69, 74, 77, 149],
  [47, 56, 60, 115],
  [87, 79, 90, 175],
  [79, 70, 88, 164],
  [69, 70, 73, 141],
  [70, 65, 74, 141],
  [93, 95, 91, 184],
  [79, 80, 73, 152],
  [70, 73, 78, 148],
  [93, 89, 96, 192],
  [78, 75, 68, 147],
  [81, 90, 93, 183],
  [88, 92, 86, 177],
  [78, 83, 77, 159],
  [82, 86, 90, 177],
  [86, 82, 89, 175],
  [78, 83, 85, 175],
  [76, 83, 71, 149],
  [96, 93, 95, 192]
];  
		*/
		/*
		var X = new Array(dataset.length);
		var Y = new Array(dataset.length);

		for (var i = 0; i < dataset.length; ++i) {
		  X[i] = dataset[i].slice(0, 3);
		  Y[i] = dataset[i][3];
		}  */

		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			cls = new RAF.RandomForestRegression({
			  seed: 3,
			  maxFeatures: 2,
			  replacement: false,
			  nEstimators: 200
			});

		//X.length = Y.length = 25;
		//X.$( (n,x) => x[n] = x[n].slice(0,3) );  // dataset[n].slice(0,3) ); //
		//Y.$( (n,y) => y[n] = dataset[n][3] );

		//Log("x",X, "y",Y);

		Log("raf", X.length, Y.length, N, X[0].length);
		cls.train(X,Y);
		if (cb) cb(cls);
		return cls;
	},

	raf_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	som_train: function (x,y,solve,cb) {
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			XY = $( N, (n, xy) => xy[n] = [ X[n], Y[n] ] ),			
			cls = new SOM(solve.xdim || 30, solve.ydim || 30, solve);

		cls.train(XY);
		if (cb) cb( cls.export() );
		return cls;
	},

	som_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	ols_train: function (x,y,solve,cb) {
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			degree = solve.degree,
			Y = degree ? Y : $(N, (n,y) => y[n] = [ Y[n] ] ),
			cls = degree ? new SPR(X,Y,solve.degree) : new MLR(X,Y);

		if (cb) cb(cls);		
		return cls;
	},

	ols_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	svm_train: function (x,y,solve,cb) {
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			XY = $( N, (n, xy) => xy[n] = [ X[n], Y[n] ] );

		//Log("XY", XY);
		var
			cls = new SVM.SVM({});

		cls
		.train(XY)
		.spread( (model) => {
			if (cb) cb(model);
		})
		.done ( (rep) => {
			//Log("testpred", cls.predictSync(X[0]), cls.predictSync(X[1]) );
		} );

		return cls;
	},

	svm_predict: function (cls, x) {
		var
			N = x._size[0],
			X = x._data,
			predict = cls.predictSync,
			Y = $( N, (n,y) => y[n] = predict( X[n] ) );

		Log("X", X, "pred", predict, cls.isTrained);
		Log("svm", JSON.stringify(cls));

		Log("y",Y);
		return $.matrix(Y);
	},

	lrm_train: function (x,y,solve,cb) {
		var
			X = new ml$(x._data),
			Y = ml$.columnVector( categorize(y._data) ),
			cls = new LRM(solve);

		Log("lrm training", "steps:", cls.numSteps, "rate:", cls.learningRate);
		cls.train(X,Y);
		if (cb) cb(cls);		
		return cls;
	},

	lrm_predict: function (cls,x) {
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	knn_train: function (x,y,solve,cb) {
		var
			X = new ml$(x._data),
			Y = ml$.columnVector(y._data),
			cls = new KNN(X,Y,solve);

		Log("knn training", "k", solve.k);
		if (cb) cb(cls);		
		return cls;
	},

	knn_predict: function (cls,x) {
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	pls_train: function (x,y,solve,cb) {
		var
			X = new ml$(x._data),
			Y = ml$.columnVector(y._data),
			cls = new PLS(solve);

		Log("pls training", solve);
		cls.train(X,Y);
		if (cb) cb(cls);		
		return cls;
	},

	pls_predict: function (cls,x) {
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	// linear algebra
	
	svd: function (a) {
		var svd = new ML.SVD( a._data );
		Log(svd);
	},

	evd: function (a) {	// eigen vector decomposition
		var evd = new ML.EVD( a._data );  //, {assumeSymmetric: true}
		return {
			values: $.matrix(evd.d), 
			vectors: $.matrix(evd.V)
		}; 
	},
	
	rng: function (min,max,N) { 	// range
		var
			del = (max-min) / (N-1);
		
		return $.matrix( $( N, (n,R) => { R[n] = min; min+=del; } ) );
	},

	xcorr: function ( xccf ) { 
	/* 
	Returns N x N complex correlation matrix Xccf [unitless] sampled from the given 2N+1, odd
	length, complex correlation function xccf [unitless].  Because Xccf is band symmetric, its 
	k'th diag at lag k contains xccf(lag k) = xccf[ N+1 + k ] , k = -N:N
	*/
		
		var 
			xccf = xccf._data,
			N = xccf.length,   	//  eg N = 9 = 2*(5-1) + 1
			N0 = floor( (N+1)/2 ),		// eg N0 = 5
			M0 = floor( (N0-1)/2 ),		// eq M0 = 2 for 5x5 Xccf
			K0 = N0-1,	// 0-based index to 0-lag
			Xccf = $$( N0, N0, (m,n,X) => X[m][n] = 0 );

		//Log("xcorr",N,N0,M0);
		
		for (var n = -M0; n<=M0; n++) 
			for (var m = -M0; m<=M0; m++) {
				var k = m - n;
				Xccf[m+M0][n+M0] = xccf[ k+K0 ];
				//Log(n,m,k);
			}
		
		//Log(Xccf);
		return $.matrix( Xccf );
	},
	
	sinc: function (x) {
		var x = x._data, N = x.length;
		return $.matrix( $( N, (n, sinc) => sinc[n] = x[n] ? sin( PI*x[n] ) / (PI*x[n]) : 1) );
	},
	
	rect: function (x) {
		var x = x._data, N = x.length;
		return $.matrix( $( N, (n, rect) => rect[n] = (abs(x[n])<=0.5) ? 1 : 0) );
	},

	tri: function (x) {
		var x = x._data, N = x.length;
		return $.matrix( $( N, (n, tri) => { 
			var u = abs( x[n] );
			tri[n] = (u<=1) ? 1-u : 0;
		}) );
	},
	
	negexp: function (x) {
		var x = x._data, N = x.length;
		return $.matrix( $( N, (n, neg) => neg[n] = (x[n] > 0) ? exp(-x[n]) : 0) );
	},
		
	lorenzian: function (x) {
		var x = x._data, N = x.length;
		return $.matrix( $( N, (n, lor) => lor[n] = 2 / (1 + (2*pi*x[n]**2)) ));
	},
	
	dht: function (f) {  
	/*
	Returns discrete Hilbert transform of an odd length array f
	*/
		var 
			f = f._data, 
			N = f.length, 
			a = 2/Math.PI, 
			N0 = floor( (N-1)/2 ),   // 0-based index to 0-lag
			isOdd = N0 % 2, isEven = isOdd ? 0 : 1;
		
		return $.matrix( $(N, (n,g) => { 
			var n0 = n - N0;
			if ( n0 % 2) // odd n so use even k 
				for (var sum=0,k=isOdd, k0=k-N0; k<N; k+=2,k0+=2) sum += f[k] / (n0 - k0); // Log( n0, k0, f[k], n0-k0, sum += f[k] / (n0 - k0) );  //
			
			else  // even n so use odd k
				for (var sum=0,k=isEven, k0=k-N0; k<N; k+=2,k0+=2) sum += f[k] / (n0 - k0); // Log( n0, k0, f[k], n0-k0, sum += f[k] / (n0 - k0) );
		
			g[n] = a*sum;
		}) );
	},
		
	pwrem: function (nu, z) {
	/*
	Returns paley-weiner remainder given zeros z in complex UHP at frequencies 
	nu = [ -f0, ... +f0 ] [Hz]
	*/
		var 
			z = z._data,
			N = z.length,
			ctx = {
				nu: nu,
				rem: $.matrix( $( nu._data.length, (n,R) => R[n] = 0 ) )
			};
		
		for (var n=0; n<N; n++) {
			ctx.z = z[n];
			$.eval("rem = rem + arg( (nu - z) ./ (nu - conj(z)) );", ctx);
		}
		
		return ctx.rem;
	},
	
	pwt: function (modH, z) { 
	/* 
	Returns paley-weiner recovery of H(nu) = |H(nu)| exp( j*argH(nu) ) given its modulous 
	and its zeros z=[z1,...] in complex UHP
	*/
		
		var 
			N = modH._data.length,
			ctx = {
				N: N, 
				modH: modH, 
				z: z
			};

		$.eval( "nu = rng(-fs/2, fs/2, N); argH = dht( log( modH ) ) + pwrem(nu, z); ", ctx ); 
		return ctx.argH;
	},
	
	dft: function (F) {
	/*
	Returns unnormalized dft/idft of an odd length, real or complex array F.
	*/
		var 
			F = F._data,
			N = F.length,
			isReal = isNumber( F[0] ),
			G = isReal 
				? 	$( N-1, (n,G) =>  { // alternate signs to setup dft and truncate array to N-1 = 2^int
						G[n] = (n % 2) ? [-F[n], 0] : [F[n], 0];
					})
			
				: 	$( N-1, (n,G) =>  { // alternate signs to setup dft and truncate array to N-1 = 2^int
						G[n] = (n % 2) ? [-F[n].re, -F[n].im] : [F[n].re, F[n].im];
					}),
		
			g = DSP.ifft(G);

		g.$( (n) => {  // alternate signs to complete dft 
			var gn = g[n];
			g[n] = (n % 2) ? $.complex(-gn[0], -gn[1]) : $.complex(gn[0], gn[1]);
		});

		g.push( $.complex(0,0) );
		return $.matrix(g);
	},
	
	wkpsd: function (ccf, T) {  
	/* 
	Return weiner-kinchine psd [Hz] at frequencies nu [Hz] = [-f0 ... +f0] of a complex corr func 
	ccf [Hz^2] of len N = 2^K + 1 defined overan interval T [1/Hz], where the cutoff f0 is 1/2 the
	implied	sampling rate N/T.
	*/
		var 
			ccf = ccf._data,
			ctx = {
				N: ccf.length,
				T: T,
				ccf: $.matrix(ccf)  // [Hz^2]
			};

		$.eval( `
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
				s: $.eval("i*2*pi*nu", {nu: nu}),
				Gu: 0
			};
		
		for (var i=0; i<K; i++) 
			for (var j=0; j<K; j++) {
				ctx.ti = t[i],
				ctx.tj = t[j];
				
				//if ( abs( ti - tj ) < T/2 ) 
				$.eval("Gu = Gu + exp( s*(ti-tj) )", ctx);
			}
		
		$.eval("Gu = Gu/T", ctx);
		return ctx.Gu;
	},

	evpsd: function (evs,nu,T,idKey,tKey) {
	/* 
	Return psd [Hz] at the specified frequencies nu [Hz], and the mean event rate [Hz] given 
	events evs = [{tKey: t1,idKey: id}, {tKey: t2, idKey: id}, ... ] over an observation 
	interval  T [1/Hz] with event idKey and tKey as provided.
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
		
		//Log("evpsd", idKey, tKey, evs[0]);
		
		for (var ids=0, N=evs.length, n=0; n<N; ids++) {
			var 
				t = ctx.t = $.matrix([]), 
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
			$.eval(" Gu = Gu + psd(t, nu, T) ", ctx);
		}
		ctx.ids = ids;
		Log("evpsd ids=", ctx.ids);
		return $.eval(" {psd: re(Gu)/ids, rate:  mean(Ks)/T } ", ctx); 
	},
	
	// misc

	shuffle: function (x,y,N) {
		var
			x = x._data,
			y = y._data,
			N = min(x._data,y._data,N),
			devs = $( N, (n, devs) => devs[n] = {idx: n, val: random()} ).sort( (a,b) => a.val - b.val );

		return {
			x: $.matrix( $( N, (n,x0) => x0[n] = x[ devs[n].idx ] ) ),
			y: $.matrix( $( N, (n,y0) => y0[n] = y[ devs[n].idx ] ) )
		};
	},
	
	// deviates
	
	udev: function (N,a) {  
	/* 
	Returns uniform random deviate on [0...a]
	*/
		return $.matrix( $(N, (n,R) => R[n] = a*random() ) );
	},
	
	expdev: function (N,a) {  
	/* 
	Returns exp random deviate with prescribed mean a
	*/
		return $.eval( "-a*log( udev(N,1) )" , {a:a, N:N} );
	},

	cumsum: function (x) {
		var
			x = x._data,
			N = x.length;
		
		return $.matrix( $(N, (n,X) => X[n] = n ? X[n-1] + x[n] : x[0] ) );
	},
	
	// special
	
	zeta: function (a) {},
	infer: function (a) {},
	va: function (a) {},
	mle: function (a) {},
	mvn: function (a) {},
	lfa: function (a) {},
	lma: function (a) {},
	rnn: function (a) {},
	
	disp: function (a) {
		if ( isObject(a) )
			for (var key in a) {
				var val = a[key];
				Log(key, val._data ? val._data : val);
			}
		
		else
			Log( a._data ? a._data : a );
	}
});

function Trace(msg,sql) {
	TRACE.trace(msg,sql);
}

function _logp0(a,k,x) {  // for case 6.x unit testing
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

function categorize(x) {
	var cats = {}, ncats = 1;
	x.$( (n,x) => {
		var x0 = x[n];
		if ( xcat = cats[x0] ) 
			x[n] = xcat;
		else
			x[n] = cats[x0] = ncats++;
	});
	return x;
}

//=========== Unit testing

switch ( process.argv[2] ) { //< unit tests
	case "?":
		Log("unit test with 'node man.js [L1 || L2.N || L3 || L4.N || L5 || L6.N]'");
		break;
		
	case "L1":
		$( "disp( dht( [0,1,2,1,0] ) )" );
		break;
		
	case "L2.1":
		$( "disp( dht( [0,0,0,1e99,0,0,0] ) )" );
		break;
		
	case "L2.2":
		$( "disp( dht(dht( [0,0,0,1e99,0,0,0] )) )" );
		break;
		
	case "L2.3":  // sinc(x) = sin(x)/x =>  (1 - cos(x)) / x
		//$( "disp( rng(-pi,pi,21) )" );
		//$( "disp( sinc( rng(-pi,pi,21) ) )" );
		$( "disp( dht( sinc( rng(-pi,pi,21) ) ) )" );
		break;
		
	case "L2.4":  // dht(dht(f)) => -f  tho there is a dt missing somewhere in this argument
		$( "disp( dht( dht( rng(-1,1,51)  ) ) )" );
		//$( "disp( dht( dht( sinc( -pi:(2*pi)/20:pi ) ) ) )" );
		break;

	case "L3":
		$( " disp( pwt( abs(sinc( rng(-4*pi,4*pi,511)) ) , [] ) )" );
		break;
		
	case "L4.1":
		var 
			evs = [],
			M = 50,
			ctx = {
				N:65, t0: 0.2, evs: $.matrix( evs )
			};
		
		//$(" disp( urand(10,1) )");
		//$(" disp( expdev(5,1) )");
		//$(" disp( psd( udev(100,T), rng(-pi, pi, N) )/T )", {T:T, N:N});
		//$(" disp( cumsum( [1,2,3,4] ) )" );
		//$(" disp( psd( t, nu,T ) )", ctx);

		for (var m=0; m<M; m++) {
			$("lambda0 = 1/t0; t = cumsum(expdev(100, t0)); T = max(t); K0 = lambda0 * T; fs=(N-1)/T; nu = rng(-fs/2, fs/2, N); ", ctx);
			Log(ctx.K0, ctx.T, ctx.lambda0, ctx.K0/ctx.T)

			var 
				t = ctx.t._data,
				N = t.length;

			for (var n=0; n<N; n++) evs.push({t: t[n], id:m });
		}
		
		$(' Gu = evpsd(evs, nu, T, "id", "t") ', ctx);
		for (var nu = ctx.nu._data,	Gu = ctx.Gu._data, N=ctx.N, n=0; n<N; n++)  Log(nu[n].toFixed(4), Gu[n].toFixed(4));
					
		break;
		
	case "L4.2":
		var ctx = {};
		$(" N=17; T=1; fs = (N-1)/T; nu = rng(-fs/2,fs/2,N); Gu = wkpsd([0,0,0,0,0,1,2,3,4,3,2,1,0,0,0,0,0], T); df = fs/(N-1); Pu = sum(Gu)*df; Xu = xcorr(Gu); " , ctx); 
		Log("power check", ctx.Pu);
		// tri(t/t0), fs = 16; t0 = 4/fs -> 0.25; sinc^2(nu*t0) has zero at nu= +/- 4, +/- 8, ....
		
		//$(" N=9; T=1; fs = (N-1)/T; nu = rng(-fs/2,fs/2,N); Gu = wkpsd([0,0,0,1,2,1,0,0,0], T); Xu = xcorr(Gu); " , ctx); 
		// tri(t/t0), fs = 8; t0 = 2/fs = 0.25; sinc^2(nu*t0) has zero at nu= +/- 4, ...

		//Log(ctx);
		for (var nu = ctx.nu._data,	Gu = ctx.Gu._data, n=0; n<ctx.N; n++)  Log(nu[n].toFixed(4), Gu[n].toFixed(4));
		//Log(ctx.Xu._data);
		break;
		
	case "L6.1":  // LMA/LFA convergence
		
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
		
	case "L6.2":
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
		
	case "L6.3":
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
		
	case "L7":
		var ctx = {
			x: [[0,-1], [1,0], [1,1], [1,-1], [2,0], [2,1], [2,-1], [3,2], [0,4], [1,3], [1,4], [1,5], [2,3], [2,4], [2,5], [3,4], [1, 10], [1, 12], [2, 10], [2,11], [2, 14], [3, 11]],
			y: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
			x0: [[0, -2], [1, 0.5], [1.5, -1], [1, 2.5], [2, 3.5], [1.5, 4], [1, 10.5], [2.5, 10.5], [2, 11.5]]
		};
		
		$(`
lrm = lrmTrain(x,y,{numSteps:1000,learningRate:5e-3}); 
y0 = lrmPredict( lrm, x0);`, 
		  ctx, (ctx) => {

		// Log( JSON.stringify(ctx.lrm) );
			
		Log({
			x0: ctx.x0,
			y0: ctx.y0
		});
});
		/*
{ x0: 
   [ [ 0, -2 ],
     [ 1, 0.5 ],
     [ 1.5, -1 ],
     [ 1, 2.5 ],
     [ 2, 3.5 ],
     [ 1.5, 4 ],
     [ 1, 10.5 ],
     [ 2.5, 10.5 ],
     [ 2, 11.5 ] ],
  y0: [ 0, 0, 0, 1, 1, 1, 2, 2, 2 ] }
  */
		break;
		
	case "L8":
		var ctx = {
			x: [[0, 0], [0, 1], [1, 0], [1, 1]],
			y: [0, 1, 1, 0],
			x0:  [[0, 0], [0, 1], [1, 0], [1, 1]],
			save: function (model) {
				var svm = SVM.restore(model);
				
				Log("restore pred", svm.predictSync( [0,0] ), svm.predictSync( [0,1] ) );				
			}
		};
		
		$(`svmTrain( x, y, {}, save );` ,  ctx, (ctx) => {

		// Log( JSON.stringify(ctx.svm) );
			
			Log({
				x0: ctx.x0,
				y0: ctx.y0
			});
		});
		break;
		
	case "L9":
		
		var
			raf =  [
  [73, 80, 75, 152],
  [93, 88, 93, 185],
  [89, 91, 90, 180],
  [96, 98, 100, 196],
  [73, 66, 70, 142],
  [53, 46, 55, 101],
  [69, 74, 77, 149],
  [47, 56, 60, 115],
  [87, 79, 90, 175],
  [79, 70, 88, 164],
  [69, 70, 73, 141],
  [70, 65, 74, 141],
  [93, 95, 91, 184],
  [79, 80, 73, 152],
  [70, 73, 78, 148],
  [93, 89, 96, 192],
  [78, 75, 68, 147],
  [81, 90, 93, 183],
  [88, 92, 86, 177],
  [78, 83, 77, 159],
  [82, 86, 90, 177],
  [86, 82, 89, 175],
  [78, 83, 85, 175],
  [76, 83, 71, 149],
  [96, 93, 95, 192]
		],
			tests = {
				raf: {
					x: $(raf.length, (n,x) => x[n] = raf[n].slice(0,3) ),
					y: $(raf.length, (n,y) => y[n] = raf[n][3] )
				}
			};
		
		for (var met in tests) {
			var
				test = tests[met],
				ctx = {
					x: test.x,
					y: test.y,
					x0: test.x.slice(0,4)
				};
			
			$( `cls = ${met}Train(x,y,{}); y0 = ${met}Predict( cls, x0 );`, ctx, (ctx) => {
				Log(`unittest ${met}`, {x0: ctx.x0, y0: ctx.y0}, ctx.cls);
			});
		}
		break;
}

// UNCLASSIFIED
