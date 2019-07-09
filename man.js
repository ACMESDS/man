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
@requires random-seed
*/

const { Copy,Each,Log,isArray,isNumber,isString,isObject,isFunction } = require("enum");

const {random, sin, cos, exp, log, PI, floor, abs, min, max} = Math;

function saveStash(sql, stash, ID, host) {
	function saveKey( sql, key, save ) {		
		sql.query(
			`UPDATE app.?? SET ${key}=? WHERE ID=?`, 
			[host, JSON.stringify(save) || "null", ID], 
			(err) => // will fail if key does not exist or mysql server buffer too small (see my.cnf)
				Trace(err ? `DROP ${host}.${key}` : `SAVE ${host}.${key}` )
		);
	}

	for (var key in stash) 
		saveKey( sql, key, stash[key] );
}
		 
[  // String processing
	function parseEval($) {
	/**
	@member String
	@method parseEval

	Parse "$.KEY" || "$[INDEX]" expressions given $ hash.

	@param {Object} $ source hash
	*/
		try {
			return eval(this+"");
		}

		catch (err) {
			return err+"";
		}
	},
	
	function get(idx, cb) { // get event records from db using supplied query
		var query = this+"";
		
		//Log(">>>>fetching", query);
		$.thread( sql => {  
			var recs = [];

			if (idx)
				sql.forEach( TRACE, query , [], rec => {  // feed db events to grouper
					if ( recs.group(idx, rec) ) recs.flush(cb);
					recs.push(rec);
				})
				.on("end", () => {
					recs.flush(cb);
					cb( null );   // signal end-of-events
				});

			else
				sql.forAll( TRACE, query, [], recs => {  // feed all db events w/o a grouper
					recs.flush(cb);
					cb( null );  // signal end-of-events
				});
			
			sql.release();	
		});
	},
	
	function save(ctx,cb) {
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
	
	function $(idx,cb) {
		return this.get(idx,cb);
	}
	
	/*
	function $(ctx, cb) {	// index string
		if (cb) // load/save data
			if ( isString(ctx) )
				return this.get(ctx, cb);
		
			else
				return this.put(ctx,cb);

		else
			return null;
	}
	*/
	
].Extend(String);

[	// Array processing
	
	function dist(b) { 
		var 
			a = this,
			d = [ a[0]-b[0], a[1]-b[1] ];
		
		return sqrt( d[0]*d[0] + d[1]*d[1] );
	},

	function nearestOf (metric) {
		var imin = 0, emin = 1e99;

		this.forEach( (pt,i) => {
			var e = metric( pt );
			if (  e < emin) { imin = i; emin = e; }
		});
		return {idx: imin, val: emin};
	},
	
	// samplers
	
	function group(key, rec) { 
		return this.length ? rec[key] > this[0][key] : false;
	},

	function flush(cb) {  // feed events to callback cb(evs) then flush events
		if (this.length) cb( this );
		this.length = 0;
	},
	
	function shuffle(N, index) {
		var 
			A = this,
			devs = $( A.length, (n, devs) => devs[n] = {idx: n, val: random()} ).sort( (a,b) => a.val - b.val );

		return index ? $( N, (n,B) => B[n] = devs[n].idx ) : $( N, (n,B) => B[n] = A[ devs[n].idx ] ) ;
	},
	
	/*
	function pick(keys) {
		return this.$( (n,recs) => {
			var rec = recs[n], rtn = {};
			for ( var key in keys ) rtn[key] = rec[ keys[key] ];
			recs[n] = rtn;
		});		
	}, */
	
	function match(where, get) {
		var rtns = [];
		
		this.forEach( rec => {
			var matched = true;

			for (var x in where) 
				if ( rec[x] != where[x] ) matched = false; 

			if (matched) 
				if (rec) {
					var rtn = {};
					for (var from in get) 
						rtn[ get[from] ] = rec[from];
					
					rtns.push(rtn);
				}
			
				else
					rtns.push(rec);
		});

		return rtns;
	},
	
	function replace(subs) {
		return this.$( this.length, (n,rec) => {
			Each(subs, function (pre, sub) {  // make #key and ##key substitutions
				for (var idx in sub) {
					var keys = sub[idx];
					if ( rec[idx] )
						for (var key in keys)
							rec[idx] = (rec[idx] + "").replace(pre + key, keys[key]);
				}
			});
		});
	},
	
	function get(idx, cb) {	
		var A = this, N = A.length;

		if ( cb ) {  // thread idx-grouped events to callback cb(evs) or cb(null) at end
			var 
				recs = [];

			if ( idx ) {
				A.forEach( rec => { 
					if ( recs.group(idx, rec) ) recs.flush(cb);
					recs.push(rec);
				});
				recs.flush( cb );
			}

			else 
				cb(A);
			
			cb( null );   // signal end-of-events
		}
		
		else
		if ( isString(idx) )
			return $(N, (n,B) => B[n] = idx.parseEval( A[n] ) );
	 
		else
		if ( isArray(idx) )
			return $(N, (n,B) => B[n] = $( idx.length, (n,B) => B[n] = A[ idx[n] ] ) );

		else
		if ( isNumber(idx) )
			return $(N, (n,B) => B[n] = A[n].slice(0,idx) );
		
		else
		if ( isFunction(idx) ) {
			if (A.rows) {
				var M = A.rows, N = A.columns;

				for (var m=0; m<M; m++) 
					for (var n=0, Am = A[m]; n<N; n++) 
						idx(m,n,A,Am);
				
				return A;
			}

			else 
				for (var n=0; n<N; n++) idx(n,A);

			return A;
		}
		
		else
		if ( keys = idx.keys )
			return A.$( (n,recs) => {
				var rec = recs[n], rtn = {};
				for ( var key in keys ) rtn[key] = rec[ keys[key] ];
				recs[n] = rtn;
			});		
			
		else
		if ( count = idx.len || idx.count ) {
			Log("get", idx);
			return $(N, (n,B) => B[n] = A[n].slice(idx.start,idx.start+count) );
		}
		
		else
		if ( idx.draws ) 
			return $(N, (n,B) => B[n] = A[n].shuffle( idx.draws, idx.index ) );
		
		else
			return A;
	},
	
	function $(idx,cb) {
		return this.get(idx,cb);
	},
	
	function indexor(idx) {
		var A = this;
		return $(idx.length, (n,B) => B[n] = A[ idx[n] ] );
	},
	/*
	function feed( key, cb) {  
	// thread key-grouped events to callback cb(evs) or cb(null) at end
		
		var 
			recs = [];
		
		if ( key ) {
			this.forEach( rec => { 
				if ( recs.group(key, rec) ) recs.flush(cb);
				recs.push(rec);
			});
			recs.flush( cb );
		}
		
		else 
			cb(this);
			
		cb( null );   // signal end-of-events		
	},	*/
	
	function save( ctx, cb ) {
	// stash aggregated events evs into context ctx[ Save_KEYs ] then callback(remaining evs) 

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

			evs.stashify("at", "Save_", ctx, stash, (ev, stat) => {  // add {at:"KEY",...} evs to the Save_KEY stash

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

				saveStash(sql, {Save_rem: rem}, ctx.ID, ctx.Host);				
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
	
	/*
	function $(cb) {	// index matrix A
		var 
			A = this, 
			idx = expr = cb,
			N = A.length;		

		if ( isString( expr ) ) 
			return $$( expr, { "this": A } );
		
		else
		if ( isArray( idx ) ) 
			return $$( idx.length, (n,x) => x[n] = A[ idx[n] ] );
		
		else
		if (A.rows) {
			var M = A.rows, N = A.columns;

			if (cb) for (var m=0; m<M; m++) for (var n=0, Am = A[m]; n<N; n++) cb(m,n,A,Am);			
			return A;
		}

		else {
			if (cb) for (var n=0,N=A.length; n<N; n++) cb(n,A);
			return A;
		}
	},  */
	
	function stashify(watchKey, targetPrefix, ctx, stash, cb) {
	/*
	@member Array
	@method stashify
	@param [String] watchKey  this = [ { watchKey:"KEY", x:X, y: Y, ...}, ... }
	@param [String] targetPrefix  stash = { (targetPrefix + watchKey): { x: [X,...], y: [Y,...], ... }, ... } 
	@param [Object] ctx plugin context keys
	@param [Object] stash refactored output suitable for a Save_KEY
	@param [Function] cb callback(ev,stat) returns refactored result to put into stash
	Used by plugins for aggregating ctx keys into optional Save_KEY stashes such that:

			[	
				{ at: KEY, A: a1, B: b1, ... }, 
				{ at: KEY, A: a2, B: b2, ... }, ... 
				{ x: x1, y: y1 },
				{ x: x2, y: y2 },	...
			].stashify( "at", "Save_", {Save_KEY: {}, ...} , stash, cb )

	creates stash.Save_KEY = {A: [a1, a2,  ...], B: [b1, b2, ...], ...} iff Save_KEY is in the
	supplied context ctx.   If no stash.rem is provided by the ctx, the {x, y, ...} are 
	appended (w/o aggregation) to stash.remainder. Conversely, if ctx contains a stash.rem, 
	the {x, y, ...} are aggregated to stash.rem.
	*/

		var rem = stash.remainder;

		this.forEach( (stat,n) => {  // split-save all stashable keys
			var 
				key = targetPrefix + (stat[watchKey] || "rem"),  // target ctx key 
				ev = ( key in stash )
					? stash[key]  // stash was already primed
					: (key in ctx)  // see if its in the ctx
							? stash[key] = cb(null,stat, ctx[key]) // prime stash
							: null;  // not in ctx so stash in remainder

			if ( ev )  { // found a ctx target key to save results
				delete stat[watchKey];
				switch (key) {
					case "Save_jpg":
						var
							img = stat.input,
							values = stat.values,
							index = stat.index,
							cols = values.length,
							rows = index.length,
							isEmpty = values[0] ? false : true,
							toColor = IMP.rgbaToInt;
							
						Log("save jpg", {
							dims: [img.bitmap.height, img.bitmap.width], 
							save: stat.save,
							gen: [rows, cols],
							empty: isEmpty
						});
						
						if ( !isEmpty )
							for ( var col=0, vals=values[0]; col<cols; col++, vals=values[col] ) {
								//Log("vals", vals);
								for ( var row=0; row<rows; row++ ) {
									var L = max(0,min(255,floor(vals[row][0])));
									//Log(L, col, row, "->", index[row]);
									img.setPixelColor( toColor(L,L,L,255), col, index[row] );
								}
							}

						img.write( "."+stat.save, err => Log("save jpg", err) );
						
						delete stat.input;
						
						/*
						if (keep) {
							stat.values = stat.values.shuffle(keep); // Array.from(values.slice(0,keep)).$( (n,v) => v[n] = v[n].slice(0,keep) );
							stat.index = index.shuffle(keep); // index.slice(0,keep);
						}
						else {
							delete stat.values;
							delete stat.index;
						}*/
						
						cb(ev, stat);
						break;
						
					default:
						cb(ev, stat);
				}
			}

			else  
			if (rem)  // stash remainder 
				rem.push( stat );
		});
	}	
].Extend(Array);

var $ = $$ = MAN = module.exports = function $(code,ctx,cb) {
	switch (code.constructor) {
		case String:
			if (cb) {
				var vmctx = {};

				for (key in ctx) 
					if ( val = ctx[key] ) 
						vmctx[key] = isArray(val) ? $.matrix(val) : val;
				
					else
						vmctx[key] = val;

				try {
					$.eval(code, vmctx);
				}
				catch (err) {
					Log(err);
				}

				for (key in vmctx) 
					if ( val = vmctx[key] ) 
						vmctx[key] = val._data ? val._data : val;
				
					else
						vmctx[key] = val;

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
			
			else {
				for (var key in code) Trace(`IMPORTING ${key}`);

				Copy(code,$);		// mixin them for access from $[name]
				$.import(code);		// import them for access from $(" name(...) ")
			}
			
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
	IMP = require('jimp'),
	EM = require("expectation-maximization"),  // there is a mljs version as well that uses this one
	MVN = require("multivariate-normal").default,
	LM = require("./mljs/node_modules/ml-levenberg-marquardt"),
	ML = require("./mljs/node_modules/ml-matrix"),
	LRM = require("./mljs/node_modules/ml-logistic-regression"),
	RAF = require("./mljs/node_modules/ml-random-forest").RandomForestRegression,
	DTR = require("./mljs/node_modules/ml-cart").DecisionTreeRegression,
	KNN = require("./mljs/node_modules/ml-knn"),
	NAB = require("./mljs/node_modules/ml-naivebayes").MultinomialNB,
	MLR = require("./mljs/node_modules/ml-regression-multivariate-linear"),
	SPR = require("./mljs/node_modules/ml-regression-polynomial"),
	ROR = require("./mljs/node_modules/ml-regression-robust-polynomial"),
	PLS = require("./mljs/node_modules/ml-pls").PLS,
	SOM = require("./mljs/node_modules/ml-som"),
	SVM = require("./mljs/node_modules/ml-svm"), // require("node-svm"),
	GAMMA = require("gamma"),
	DSP = require("fft-js"),
	//RAN: require("randpr"),  // added by debe to avoid recursive requires
	//SVD: require("node-svd"),
	//RNN: require("recurrentjs"),
	BAYES = require("jsbayes"),
	HMM = require("nodehmm"),
	ZETA = require("riemann-zeta"),
	NRAP = require("newton-raphson"),
	GEN = require("random-seed"),
	ml$ = ML.Matrix;

//console.log("jslab las=", ML);

Copy({
	// methods
	
	thread: () => Trace("sql threader not configured"), //< define on config

	tasker: () => Trace("tasker not configured"), //< define on config

	saveKeys: { //< define plugin save-keys on config
	},
	
	config: function (opts, cb) {
		if (opts) Copy(opts, $, ".");

		var
			saveKeys = $.saveKeys;

		$.thread( sql => {
			sql.getFields("app._stats", null, [], function (keys) {
				keys.forEach(function (key) {
					saveKeys[key] = true;
				});
			});
			sql.release();
		});

		if (cb) cb(null);	
	},
	
	supervisedROC: function (chip,aoicase,cb) { // Load chip with Npixels then callback(cb).  Auto-forecasting when needed.

		function paste(img, src, left, top, cb) {
			if ( left+src.width() > img.width() )
				left = img.width() - src.width();

			if ( top+src.height() > img.height() )
				top = img.height() - src.height();

			if (cb)
				img.paste(left, top, src, function (erm,img) {
					img.clone(function (err,img) {
						cb(img);
					});
				});
			else
				img.paste(left, top, src);
		}

		function rotate(img, angle, cb) {
			var bgcolor = [255,255,255,0];
			if (cb)
				img.rotate(angle, bgcolor, function (err,img) {
					img.clone(function (err,img) {
						cb(img);
					});
				});
			else
				img.rotate(angle, bgcolor);
		}

		function border(img, pad, cb) {
			if ( isArray(pad) ) 
				pad.each(function (n,val) {
					img.clone(function (err,image) {
						border(image, val, cb);
					});
				});

			else
			if (pad)
				img.border(pad, [0,0,0,0], function (err,image) {
					cb(image);
				});

			else
				cb(img);
		}

		function flip(img, axis, cb) {
			if (axis)
				if (cb)
					img.flip(axis, function (err,img) {
						img.close(function (err,img) {
							cb(img);
						});
					});
			else
			if (cb)
				cb(img);
		}

		function resize(img, width, height, cb) {
			if (cb) 
				img.resize(width, height, function (err, img) {
					img.clone(function (err,img) {
						cb(img);
					});
				});
			else
				img.resize(width, height);
		}

		function open(src, args, cb) {
			IMP.open(src, "jpg", function (err,img) {
				if (err)
					console.log(err);
				else
				if (cb)
					cb(img.batch(), Copy({open:{width: img.width(), height: img.height()}}, args));
			});
		}

		function embedPositives(bgname, fcname, draws, cb) { 
		/** 
		create a forcasting jpg fcname by dropping random source jpgs at random 
		scales, flips and rotations into a background jpg bgname.
		*/
			var drops  = 0; for (var n in draws) drops++;

			if (drops) 
				open(ENV.HACK+bgname, [], function (bg, args) {

					var 
						bgwidth = args.open.width,
						bgheight = args.open.height;

					for (var n in draws) 
						open(ENV.PROOFS+draws[n].src, draws[n], function (img, drop) {
							resize( img, drop.width, drop.height);
							flip( img, drop.flip);
							rotate( img, drop.rot);

							img.exec( (err,img) => {

								if (drop.left+img.width() > bgwidth )
									drop.left = img.wdith() - img.width();

								if (drop.top+img.height() > bgheight )
									drop.top = img.height() - img.heigth();

								bg.paste(drop.left, drop.top, img);

								if (! --drops)
									bg.exec( (err,bgimg) => {
										bgimg.writeFile(ENV.HACK+"forecast_"+fcname, "jpg", {}, function (err) {
											if (cb) cb(fcname);
										});
									});
							});
						});
				});

			else
				cb(bgname);
		}

		function runForecast(chip,aoicase,cb) {
			if (model = HACK.models.none) {  // use forecasting model
				var 
					aoi = chip.aoi,
					Npixels = aoi.chipPixels,
					sites = Npixels * Npixels,   // Nfeatures ^ 2 ??
					gfs = aoi.gfs,
					name = aoicase.Name,
					obs = aoicase.oevents.length,  // max observation sites say 64 ??
					bgname = chip.fileID,
					emeds = 0;

				model.levels.forEach( (f,n) => { // n'th forecast at level f
					chip.forecast(f, name, model.name, obs, function (roc,fchip) { // forecast at level f
						var
							Nnew = roc.Npos - embeds,
							draws = {},
							srcs = models.srcs,
							flips = models.flips,
							rots = model.rots,
							aspect = 40/100,
							scales = model.scales;

						for (var n=0; n<Nnew; ) {
							if (! draws[ i = round(random() * sites) ] )
								draws[i] = { // draw a random embed
									idx: n++,
									height: round(gfs*scale.samp()*aspect),
									width: gfs*scale.samp(),
									src: srcs.samp(),
									flip: flips.samp(),
									rot: rots.samp(),
									top: round(i / Npixels),
									left: i % Npixels
								};

							else
								console.log(["skip",n,i]);
						}

						embedPositives(
							bgname, // name of background image to embed forecasting jpgs
							fchip.ID, 	// name of forecast jpg
							draws, 	// random draw for embeds
							name => {  // run detector against forecasting chip
								fchip.ID = name;
								cb(fchip);		
						});

						embeds += Nnew;
						bgname = fchip.ID;
					});
				});
			}

			else  // no forecasting model
				cb(chip);
		}

		var 
			chipName = this,
			fetchImage = HACK.fetchImage,
			chipPath = fetchImage.wgetout = HACK.paths.images + chipName;

		FS.stat(chipPath, err => { // check if chip in cache
			if (err)  // not in cache
				fetchImage( {bbox:chip.bbox.join(",")}, err => {
					//console.log({fetchimage: rtn});

					Trace("FETCH "+chip.fileID);
					if ( !err) runForecast(chip, aoicase, cb);
				});

			else { 	// in cache
				Trace("CACHE "+chip.fileID);
				runForecast(chip, aoicase, cb);
			}
		});
	},											
			
	// libraries
		
	JSON: JSON,
	IMP: IMP,
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
	NAB: NAB,
	MVN: MVN,
	LM: LM,
	GAMMA: GAMMA,
	GEN: GEN,

	// basic enumerators
	Copy: Copy,
	Each: Each,
	Log: Log,
	console: console

}, $);

//=========== Extend mathjs emulator

$.import({ // overrides
	eye: $.identity,
}, {	 
	override: true
});

$.extensions = {		// extensions
	// misc and samplers
	
	isDefined: x => x ? true : false,
	
	/*
	shuffle: function (x,y,N) {
		var
			x = x._data,
			y = y._data,
			idx = $.rng(0,x.length)._data.sampler(N);

		//Log("shuffle", idx);
		return {
			x: $.matrix( x.$( idx ) ),
			y: $.matrix( y.$( idx ) )
		};
	}, */
		
	// regressors

	rnn_train: function (x,y,solve) {
	},
	
	rnn_predict: function (x,y,solve) {
	},
	
	ann_train: function (x,y,solve) {
	},
	
	ann_predict: function (x,y,solve) {
	},
	
	dnn_train: function (x,y,solve) {
	},
	
	dnn_predict: function (x,y,solve) {
	},
	
	dhs_train: function (x,y,solve) {
	},
	
	dhs_predict: function (x,y,solve) {
	},
	
	qda_train: function (x,y,solve) {  // quadratic discriminant analysis (aka bayesian ridge)

		var 
			mixes = solve.mixes || 5,
			x = solve.x || "x",
			y = solve.y || "y",
			z = solve.z || "z",			
			evs = [];

		x.forEach( ev => evs.push( [ev[x],ev[y],ev[z]] )  );

		return $.EM( evs, mixes );
	},
	
	qda_predict(cls, x) {
		var
			X = x._data,
			N = X.length,
			mles = cls,
			mixes = mles.length,
			MVN = $.MVN,
			P = $(mixes),
			P0 = 0.75,
			Y = $(N, (n,y) => {
				var x = X[n];
				P.$( k => P[k] = {idx: k, val: MVN( x, mles[k].mu, mles[k].sigma )} );
				P.$( k => P[k] += k ? P[k-1] : 0 );
				P.$( k => { if (P[k]<P0) y[n] = k; } );
				//y[n] = P.sort( (a,b) => b.val - a.val )[0];
			});
		
		return $.matrix(Y);
	},
	
	lda_train: function (x,y,solve) { // linear discriminant analysis (aka bayesian ridge)

		var 
			mixes = solve.mixes || 5,
			x = solve.x || "x",
			y = solve.y || "y",
			z = solve.z || "z",			
			evs = [];

		x.forEach( ev => evs.push( [ev[x],ev[y],ev[z]] )  );

		return $.EM( evs, mixes );
	},
	
	lda_predict(cls, x) {
		var
			X = x._data,
			N = X.length,
			mles = cls,
			mixes = mles.length,
			MVN = $.MVN,
			P = $(mixes),
			sigma = mles[0].sigma,
			Y = $(N, (n,y) => {
				var x = X[n];
				P.$( k => P[k] = {idx: k, val: MVN( x, mles[k].mu, sigma )} );
				y[n] = P.sort( (a,b) => b.val - a.val );
			});
		
		return $.matrix(Y);
	},
	
	ror_train: function (x,y,solve) {
		var
			X = x._data,
			Y = y._data,
			cls = new $.ROR( X, Y, solve.degree || 1 );

		return cls;
	},

	ror_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	dtr_train: function (x,y,solve) {
		Log("in dtr", x._size, y._size);
		var
			X = x._data,
			Y = y._data,
			cls = new $.DTR( Copy( solve, {
				gainFunction: 'gini',
				maxDepth: 10,
				minNumSamples: 3
			}) );

		cls.train(X,Y);
		Log("dec tree", cls);
		return cls;
	},

	dtr_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	raf_train: function (x,y,solve) {
		
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			cls = new RAF( Copy(solve, {
				seed: 3,
				maxFeatures: 2,
				replacement: false,
				nEstimators: 200
			}));

		Log("raf training", {
			dims: [X.length, Y.length], 
			features: N
		});
		
		cls.train(X,Y);
		return cls;
	},

	raf_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	nab_train: function (x,y,solve) {
		var
			X = x._data,
			Y = y._data,
			cls = new NAB( );

		cls.train(X,Y);
		return cls.export();
	},

	nab_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},
	
	som_train: function (x,y,solve) {
		var
			X = x._data,
			solve = Copy( solve, {dims: {}} ),
			cls = new SOM( solve.dims.x || 20, solve.dims.y || 20, Copy( solve, {
				fields: [ {name: "r", range: [0,255]}, {name: "g", range: [0,255]}, {name: "b", range: [0,255]} ]
			}) );

		cls.train(X);
		return cls.export();
	},

	som_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	ols_train: function (x,y,solve) {
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			degree = solve.degree,
			Y = degree ? Y : $(N, (n,y) => y[n] = [ Y[n] ] ),
			cls = degree ? new SPR(X,Y,solve.degree) : new MLR(X,Y);

		return cls;
	},

	ols_predict: function (cls, x) {
		var
			X = x._data,
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	svm_train: function (x,y,solve) {
		/*
		// legacy version
		var
			X = x._data,
			Y = y._data,
			N = x._size[0],
			XY = $( N, (n, xy) => xy[n] = [ X[n], Y[n] ] );

		Log("XY", XY);
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
		*/
		
		var 
			X = x._data,
			Y = y._data.$( (n,y) => y[n] = y[n][0] ),
			cls = new SVM( Copy( solve, {
				C: 0.01,
				tol: 10e-4,
				maxPasses: 10,
				maxIterations: 10000,
				kernel: 'rbf',
				kernelOptions: {
					sigma: 0.5
				}
			}) );
		
		cls.train(X,Y);
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

	lrm_train: function (x,y,solve) {
		
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
	
		var
			X = new ml$(x._data),
			//Y = ml$.columnVector( categorize(y._data) );
			Y = ml$.columnVector( y._data ),
			cls = new LRM( Copy( solve, {
				numSteps: 1e3,
				learningRate: 5e-3		
			}) );

		Log("lrm training", {
			steps: cls.numSteps, 
			rate: cls.learningRate
		});
		
		cls.train(X,Y);
		return cls;
	},

	lrm_predict: function (cls,x) {
		//Log("predict", x);
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	knn_train: function (x,y,solve) {
		var
			X = new ml$(x._data),
			Y = ml$.columnVector(y._data),
			cls = new KNN(X,Y,solve);

		Log("knn training", "k", solve.k);
		return cls;
	},

	knn_predict: function (cls,x) {
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	pls_train: function (x,y,solve) {
		var
			X = new ml$(x._data),
			Y = ml$.columnVector(y._data),
			cls = new PLS( Copy( solve, {
				latentVectors: 10,
				tolerance: 1e-4				
			}) );

		Log("pls training", solve);
		cls.train(X,Y);
		return cls;
	},

	pls_predict: function (cls,x) {
		var 
			X = new ml$(x._data),
			Y = cls.predict(X);

		return $.matrix(Y);
	},

	// process generator
	
	gen: function (opts, res) {	// generate gauss, wiener, markov, bayesian, ornstein process
	
		function genTest(N, beta0, beta1, seed) {
			var 
				gen = GEN.create(),
				u = seed ? gen.seed( seed ) : 0,
				rand = gen.random,
				X = $( N, (n,x) => x[n] = [2*rand()-1, 2*rand()-1] ),
				Y = $( N, (n,y) => {
					var
						x = X[n],
						p = 1.0/(1.0+ exp( -(beta0 + beta1[0]*x[0] + beta1[1]*x[1]) ));

					y[n] = (random()>=p) ? 1 : 0;
					//Log(n,p,y[n], beta0, beta1, x,  beta0 + beta1[0]*x[0] + beta1[1]*x[1] );
				});

			return {x: $.matrix(X), y: $.matrix(Y)};			
		}
		
		function KL( solve, cb ) { // Karhouen-Loeve expansion with callback cb(pcs) || cb(null)
			
			function getpcs(model, coints, dim, cb) {  // get pcs with callback cb(pcs) || cb(null)

				$.thread( sql => {
					function genpcs( coints, model, dim, cb) {  // make pcs with callback cb(pcs = {values,vectors,ref})
						function evd( models, coints, dim, cb) {   // eigen value decomp with callback cb(pcs)
							models.forEach( function (model) {	// enumerate over all models
								coints.forEach( (coints) => {	// enumerate over all coherence intervals
									$( `
	t = rng(-T, T, 2*N-1);
	Tc = T/M;
	xccf = ${model}( t/Tc );
	Xccf = xmatrix( xccf ); 
	R = evd(Xccf); `,   
									{
										N: dim,
										M: coints,
										T: 50
									}, ctx => {

										if (solve.trace)  { // debugging
											$(`
	disp({
	M: M,
	ccfsym: sum(Xccf-Xccf'),
	det: [det(Xccf), prod(R.values)],
	trace: [trace(Xccf), sum(R.values)]
	})`, ctx);
										}

	/*
	basis: R.vectors' * R.vectors,
	vecres: R.vectors*diag(R.values) - Xccf*R.vectors,
	*/
										cb({  // return computed stats
											model: model,
											intervals: coints,
											values: ctx.R.values._data,
											vectors: ctx.R.vectors._data
										});
									});
								});
							});
						}

						evd( [model], [coints], dim, function (pcs) {

							var 
								vals = pcs.values,
								vecs = pcs.vectors,
								ref = $.max(vals);

							pcs.ref = ref;
							pcs.dim = dim;

							Log(">>>evded pcs", vals.length );

							sql.beginBulk();

							vals.forEach( (val, idx) => {  // save pcs
								var
									save = {
										correlation_model: model,
										coherence_intervals: coints,
										eigen_value: val,	// val/ref
										eigen_index: idx,
										ref_value: ref,
										max_intervals: dim,
										eigen_vector: JSON.stringify( vecs[idx] )
									};

								//Log(save);

								sql.query("INSERT INTO app.pcs SET ? ON DUPLICATE KEY UPDATE ?", [save,save] );
							});

							sql.endBulk();
							Log(">>>>saved pcs");

							cb( pcs );  // forward the saved pcs
						});
					}

					function findpcs( coints, model, lims, cb ) { // get pcs with callback cb(pcs = {values,vectors,ref})
						sql.query(
							"SELECT *, abs(? - coherence_intervals)  AS coeps FROM app.pcs WHERE coherence_intervals BETWEEN ? AND ? AND eigen_value / ref_value > ? AND least(?,1) ORDER BY coeps desc,eigen_value", 
							[ coints, coints*(1-lims.coints), coints*(1+lims.coints), lims.mineig, {
								max_intervals: lims.dim, 
								correlation_model: model
							}], (err, pcs) => {
								if ( err ) 
									Log( err );

								else {
									var vals = [], vecs = [], dim = lims.dim, ref = pcs.length ? pcs[0].ref_value : 0;

									pcs.forEach( (pc) => {
										if ( vals.length < dim ) {
											vals.push( pc.eigen_value );
											vecs.push( JSON.parse( pc.eigen_vector ) );
										}
									});

									cb({
										values: vals,
										vectors: vecs,
										dim: dim,
										ref: ref
									});
								}
						});
					}

					findpcs( solve.coints, solve.model, { 
						coints: 0.1,
						mineig: solve.mineig,
						dim: solve.dim
					}, pcs => {
						Log(">>>>found pcs");
						if ( pcs.values.length )   // found pcs so send them on
							cb( pcs );

						else  // try to generate pcs
							genpcs( sql, coints, model, dim, pcs => {  
								Log(">>>>gened pcs", pcs.values.length);
								if ( pcs.values.length )
									findpcs( solve.coints, solve.model, { // must now find pcs per limits
										coints: 0.1,
										mineig: solve.mineig,
										dim: solve.dim
									}, pcs => {
										if ( pcs.values.length) 
											cb( pcs );

										else
											cb(null);
									});

								else
									cb( null );
							});
					});
				
					sql.release();
				});
			}
	
			// Should add a ctx.Shortcut parms to bypass pcs and use an erfc model for eigenvalues.

			if ( solve.model )
				getpcs( solve.model, solve.coints, solve.dim, pcs => {
					pcs.mean = solve.mean;
					cb(pcs);
				});
			
			else
				cb( null );
		}
		
		function genProc(opts, cb) {  // generate gaussian process
			var ran = new $.RAN(opts);  // create a random process compute thread

			ran.pipe(cb);   // run process and capture results
		}
		
		if (gauss = opts.gauss) {	// generate gaussian process using exact pcs or approx negbin
			var 
				N = T = opts.steps, 
				dt = 1/opts.nyquist;
			
			if (gauss.model && gauss.coints)	// exact using pcs with specified coherence intervals
				KL({  // parms for Karhunen Loeve solver
					trace: false,   // eigen debug
					T: T,  // observation interval  [1/Hz]
					coints: gauss.coints , // coherence intervals
					mean: gauss.mean * dt / T, // mean events over sample time
					dim: gauss.dim || N,  // max coherence intervals when pcs are generated
					model: gauss.model || "sinc",  // assumed correlation model for underlying CCGP
					mineig: gauss.mineig || 0.1	// min eigen/ref level (typically >= 0.05 to use stable eigenvectors)
				}, pcs => {

					if (pcs) {  // use eigen expansion to generate counts
						opts.gauss = {
							values: pcs.values,   // pc eigen values  [unitless]
							vectors: pcs.vectors, // pc eigen values	[sqrt Hz]
							ref: pcs.ref,	// ref eigenvalue
							dim: pcs.dim,	// max pc dim = obs interval
							mean: gauss.mean  // mean count
						};
						
						Log("gauss pr", opts.gauss);
						genProc(opts, res);
					}

					else 
						res( null );
				});
			
			else { // approx via a K-state MCMC/MH with negbin equlib probs specified by mean and coints
				Log("mh/mcmc tbd");
				opts.bayes = gparms.coints ? [] : []; // negbin || poisson
				genProc(opts, res);
			}	
		}
		
		else
		if (beta = opts.beta) 
			res( genTest(opts.N, beta[0], beta[1], opts.seed) );
		
		else
			genProc(opts, res);
		
	},
	
	// recover gaussian process (detector self calibration, sepp, trigger recovery)
	
	triggerProfile: function ( solve, evs, cb) {  // callback with trigger function
	/**
	Use the Paley-Wiener Theorem to return the trigger function stats:

		x = normalized time interval of recovered trigger
		h = recovered trigger function at normalized times x
		modH = Fourier modulous of recovered trigger at frequencies f
		argH = Fourier argument of recovered trigger at frequencies f
		f = spectral frequencies

	via the callback cb(stats) given a solve request:

		evs = events list
		refLambda = ref mean arrival rate (for debugging)
		alpha = assumed detector gain
		N = profile sample times = max coherence intervals
		model = correlation model name
		Tc = coherence time of arrival process
		T = observation time
	*/

		Log("trigs", {
			evs: evs.length, 
			refRate: solve.refLambda,
			ev0: solve.evs[0]
		});

		$(`
N0 = fix( (N+1)/2 );
fs = (N-1)/T;
df = fs/N;
nu = rng(-fs/2, fs/2, N); 
t = rng(-T/2, T/2, N); 
V = evpsd(evs, nu, T, "index", "t");  

Lrate = V.rate / alpha;
Accf = Lrate * ${solve.model}(t/Tc);
Lccf = Accf[N0]^2 + abs(Accf).^2;
Lpsd =  wkpsd( Lccf, T);
disp({ 
evRates: {ref: refLambda, ev: V.rate, L0: Lpsd[N0]}, 
idx0lag: N0, 
obsTime: T, 
sqPower: {N0: N0, ccf: Lccf[N0], psd: sum(Lpsd)*df }
});

Upsd = Lrate + Lpsd;
modH = sqrt(V.psd ./ Upsd );  

argH = pwrec( modH, [] ); 
h = re(dft( modH .* exp(i*argH),T)); 
x = t/T; `,  
			{
				evs: $.matrix( evs ),
				N: solve.N,
				refLambda: solve.refLambda,
				alpha: solve.alpha,
				T: solve.T,
				Tc: solve.Tc
			}, ctx => {
				//Log("vmctx", ctx);
				cb({
					trigger: {
						x: ctx.x,
						h: ctx.h,
						modH: ctx.modH,
						argH: ctx.argH,
						f: ctx.nu
					}
				});
		});
	},
			
	coherenceIntervals: function (solve, cb) { // callback with coherence intervals M, SNR, etc 
	/*
	given solve:
		f[k] = observed probability mass at count levels k = 0 ... Kmax-1
		T = observation time
		N = number of events collected
		use = "lma" | "lfa" | "bfs"
		lma = [initial M]
		lfa = [initial M]
		bfs = [start, end, increment M]
	*/
		function logNB(k,a,x) { // negative binomial objective function
		/*
		return log{ p0 } where
			p0(x) = negbin(a,k,x) = (gamma(k+x)/gamma(x))*(1+a/x)**(-x)*(1+x/a)**(-k) 
			a = <k> = average count
			x = script M = coherence intervals
			k = count level
		 */
			var
				ax1 =  1 + a/x,
				xa1 = 1 + x/a,

				// nonindexed log Gamma works with optimizers, but slower than indexed versions
				logGx = GAMMA.log(x),
				logGkx = GAMMA.log(k+x), 
				logGk1 = GAMMA.log(k+1);

				// indexed log Gamma produce round-off errors in optimizers 
				// logGx = logGamma[ floor(x) ],
				// logGkx = logGamma[ floor(k + x) ],
				// logGk1 = logGamma[ floor(k + 1) ];

			return logGkx - logGk1 - logGx  - k*log(xa1) - x*log(ax1);
		}

		function LFA(init, f, logp) {  // linear-factor-analysis (via newton raphson) for chi^2 extrema - use at your own risk
		/*
		1-parameter (x) linear-factor analysis
		k = possibly compressed list of count bins
		init = initial parameter values [a0, x0, ...] of length N
		logf  = possibly compressed list of log count frequencies
		a = Kbar = average count
		x = M = coherence intervals		
		*/

			function p1(k,a,x) { 
			/*
			return p0'(x) =
						(1 + x/a)**(-k)*(a/x + 1)**(-x)*(a/(x*(a/x + 1)) - log(a/x + 1)) * gamma[k + x]/gamma[x] 
							- (1 + x/a)**(-k)*(a/x + 1)**(-x)*gamma[k + x]*polygamma(0, x)/gamma[x] 
							+ (1 + x/a)**(-k)*(a/x + 1)**(-x)*gamma[k + x]*polygamma(0, k + x)/gamma[x] 
							- k*(1 + x/a)**(-k)*(a/x + 1)**(-x)*gamma[k + x]/( a*(1 + x/a)*gamma[x] )			

					=	(1 + x/a)**(-k)*(a/x + 1)**(-x)*(a/(x*(a/x + 1)) - log(a/x + 1)) * G[k + x]/G[x] 
							- (1 + x/a)**(-k)*(a/x + 1)**(-x)*PSI(x)*G[k + x]/G[x] 
							+ (1 + x/a)**(-k)*(a/x + 1)**(-x)*PSI(k + x)*G[k + x]/G[x] 
							- k*(1 + x/a)**(-k)*(a/x + 1)**(-x)*G[k + x]/G[x]/( a*(1 + x/a) )			

					=	G[k + x]/G[x] * (1 + a/x)**(-x) * (1 + x/a)**(-k) * {
							(a/(x*(a/x + 1)) - log(a/x + 1)) - PSI(x) + PSI(k + x) - k / ( a*(1 + x/a) ) }

					= p(x) * { (a/x) / (1+a/x) - (k/a) / (1+x/a) - log(1+a/x) + Psi(k+x) - Psi(x)  }

					= p(x) * { (a/x - k/a) / (1+x/a) - log(1+a/x) + Psi(k+x) - Psi(x)  }

				where
					Psi(x) = polyGamma(0,x)
			 */
				var
					ax1 =  1 + a/x,
					xa1 = 1 + x/a,

					// indexed Psi may cause round-off problems in optimizer
					psix = Psi[ floor(x) ], 
					psikx = Psi[ floor(k + x) ], 

					slope = (a/x - k/a)/ax1 - log(ax1) + psikx - psix;

				return exp( logp(k,a,x) ) * slope;  // the slope may go negative so cant return logp1		
			}

			function p2(k,a,x) {  // not used
			/*
			return p0" = 
					(1 + x/a)**(-k)*(a/x + 1)**(-x)*( a**2/(x**3*(a/x + 1)**2) 
						+ (a/(x*(a/x + 1)) - log(a/x + 1))**2 - 2*(a/(x*(a/x + 1)) - log(a/x + 1) )*polygamma(0, x) 
					+ 2*(a/(x*(a/x + 1)) - log(a/x + 1))*polygamma(0, k + x) 
					+ polygamma(0, x)**2 
					- 2*polygamma(0, x)*polygamma(0, k + x) + polygamma(0, k + x)**2 - polygamma(1, x) + polygamma(1, k + x) 
					- 2*k*(a/(x*(a/x + 1)) - log(a/x + 1))/(a*(1 + x/a)) + 2*k*polygamma(0, x)/(a*(1 + x/a)) 
					- 2*k*polygamma(0, k + x)/(a*(1 + x/a)) + k**2/(a**2*(1 + x/a)**2) + k/(a**2*(1 + x/a)**2))*gamma(k + x)/gamma(x);
			 */
				var
					ax1 =  1 + a/x,
					xa1 = 1 + x/a,
					xak = xa1**(-k),
					axx = ax1**(-x),

					// should make these unindexed log versions
					gx = logGamma[ floor(x) ],
					gkx = logGamma[ floor(k + x) ],

					logax1 = log(ax1),
					xax1 = x*ax1,
					axa1 = a*xa1,				

					// should make these Psi 
					pg0x = polygamma(0, x),
					pg0kx = polygamma(0, k + x);

				return xak*axx*(a**2/(x**3*ax1**2) + (a/xax1 - logax1)**2 - 2*(a/xax1 - logax1)*pg0x 
							+ 2*(a/xax1 - logax1)*pg0kx + pg0x**2 
							- 2*pg0x*pg0kx + pg0kx**2 - polygamma(1, x) + polygamma(1, k + x) 
							- 2*k*(a/xax1 - logax1)/axa1 + 2*k*pgx/axa1 - 2*k*pg0kx/axa1 
							+ k**2/(a**2*xa1**2) + k/(a**2*xa1**2))*gkx/gx;
			}

			function chiSq1(f,a,x) { 
			/*
			return chiSq' (x)
			*/
				var 
					sum = 0,
					Kmax = f.length;

				for (var k=1; k<Kmax; k++) sum += ( exp( logp0(a,k,x) ) - f[k] ) * p1(a,k,x);

				//Log("chiSq1",a,x,Kmax,sum);
				return sum;
			}

			function chiSq2(f,a,x) {
			/*
			return chiSq"(x)
			*/
				var
					sum =0,
					Kmax = f.length;

				for (var k=1; k<Kmax; k++) sum += p1(a,k,x) ** 2;

				//Log("chiSq2",a,x,Kmax,sum);
				return 2*sum;
			}

			var
				Mmax = 400,
				Kmax = f.length + Mmax,
				eps = $(Kmax, (k,A) => A[k] = 1e-3),
				Zeta = $(Kmax, (k,Z) => 
					Z[k] = k ? ZETA(k+1) : -0.57721566490153286060   // -Z[0] is euler-masheroni constant
				), 
				Psi1 = Zeta.sum(),
				Psi = $(Kmax, (x,P) =>   // recurrence to build the diGamma Psi
					P[x] = x ? P[x-1] + 1/x : Psi1 
				);

			return NRAP( x => chiSq1(f, Kbar, x), x => chiSq2(f, Kbar, x), init[0]);  // 1-parameter newton-raphson
		}

		function LMA(init, k, logf, logp) {  // levenberg-marquart algorithm for chi^2 extrema
		/*
		N-parameter (a,x,...) levenberg-marquadt algorithm where
		k = count levels
		init = initial parameter values [a0, x0, ...] of length N
		logf  = possibly compressed list of log count frequencies
		a = Kbar = average count
		x = M = coherence intervals
		*/

			switch ( init.length ) {
				case 1:
					return LM({  // 1-parm (x) levenberg-marquadt
						x: k,  
						y: logf
					}, function ([x]) {
						//Log(Kbar, x);
						return k => logp(k, Kbar, x);
					}, {
						damping: 0.1, //1.5,
						initialValues: init,
						//gradientDifference: 0.1,
						maxIterations: 1e3,  // >= 1e3 with compression
						errorTolerance: 10e-3  // <= 10e-3 with compression
					});
					break;

				case 2:

					switch ("2stage") {
						case "2parm":  // greedy 2-parm (a,x) approach will often fail when LM attempts an x<0
							return LM({  
								x: k,  
								y: logf  
							}, function ([x,u]) {
								Log("2stage LM",x,u);
								//return k => logp(k, Kbar, x, u);
								return x ? k => logp(k, Kbar, x, u) : k => -50;
							}, {
								damping: 0.1, //1.5,
								initialValues: init,
								//gradientDifference: 0.1,
								maxIterations: 1e2,
								errorTolerance: 10e-3
							});

						case "2stage":  // break 2-parm (a,x) into 2 stages
							var
								x0 = init[0],
								u0 = init[1],
								fit = LM({  // levenberg-marquadt
									x: k,  
									y: logf
								}, function ([u]) {
									//Log("u",u);
									return k => logp(k, Kbar, x0, u);
								}, {
									damping: 0.1, //1.5,
									initialValues: [u0],
									//gradientDifference: 0.1,
									maxIterations: 1e3,  // >= 1e3 with compression
									errorTolerance: 10e-3  // <= 10e-3 with compression
								}),
								u0 = fit.parameterValues[0],
								fit = LM({  // levenberg-marquadt
									x: k,  
									y: logf
								}, function ([x]) {
									//Log("x",x);
									return k => logp(k, Kbar, x, u0);
								}, {
									damping: 0.1, //1.5,
									initialValues: [x0],
									//gradientDifference: 0.1,
									maxIterations: 1e3,  // >= 1e3 with compression
									errorTolerance: 10e-3  // <= 10e-3 with compression
								}),
								x0 = fit.parameterValues[0];

							fit.parameterValues = [x0, u0];
							return fit;	
						}
					break;	
			}
		}

		function BFS(init, f, logp) {   // brute-force-search for chi^2 extrema f = obs prob
		/*
		1-parameter (x) brute force search
		k = possibly compressed list of count bins
		init = initial parameter values [a0, x0, ...] of length N
		logf  = possibly compressed list of log count frequencies
		a = Kbar = average count
		x = M = coherence intervals			
		*/
			function NegBin(NB, Kbar, M, logp) {
				NB.$( k => NB[k] = exp( logp(k, Kbar, M) ) );
			}

			function chiSquared( f, p, N) {  // f = obs prob, p = ref prob
				var chiSq = 0;
				p.$( k => chiSq += ( p[k] - f[k] )**2 / p[k] );
				return chiSq * N;
			}

			var
				p = $( f.length ),  // reserve ref prob
				M0 = 1,		// initial guess at coherence intervals
				chiSqMin = 1e99;

			for (var M=init[0], Mmax=init[1], Minc=init[2]; M<Mmax; M+=Minc) {  // brute force search
				NegBin(p, Kbar, M, logNB);
				var chiSq = chiSquared( f, p, N);

				Log(M, chiSq, p.sum() );

				if (chiSq < chiSqMin) {
					M0 = M;
					chiSqMin = chiSq;
				}
			} 
			return M0;
		}

		var
			/*
			logGamma = $(Ktop , function (k, logG) {
				logG[k] = (k<3) ? 0 : GAMMA.log(k);
			}),
			*/
			/*
			Gamma = $(Ktop, function (k,G) {
				G[k] = exp( logGamma[k] );
			}),
			*/
			f = solve.f,		// observed count probabilities
			T = solve.T,	// observation interval
			N = solve.N,  // number of events
			Kmax = f.length,  // max count
			Kbar = 0,  // mean count
			K = [],  // list of count levels
			compress = false; // solve.lfa ? false : true,   // enable pdf compression if not using lfa

		f.$( k => Kbar += k * f[k] );

		f.$( k => {   
			if ( compress ) {  // pointless - let LMA do its magic
				if ( f[k] ) K.push( k );
			}
			else
				K.push(k); 
		});

		var
			M = 0,
			Mdebug = 0,
			logf = $(K.length, (n,logf) => {  // observed log count frequencies
				if ( Mdebug ) { // enables debugging
					logf[n] = logNB(K[n], Kbar, Mdebug);
					//logf[n] += (n%2) ? 0.5 : -0.5;  // add some "noise" for debugging
				}
				else
					logf[n] = f[ K[n] ] ? log( f[ K[n] ] ) : -7;
			});

		Log({
			Kbar: Kbar, 
			T: T, 
			Kmax: Kmax,
			N: N
			//ci: [compress, interpolate]
		});

		if (false)
			K.$( n => {
				var k = K[n];
				Log(n, k, logNB(k,Kbar,55), logNB(k,Kbar,65), log( f[k] ), logf[n] );
			});

		if ( Kmax >= 2 ) {
			var M = {}, fits = {};

			if (solve.lma) {  // levenberg-marquadt algorithm for [M, ...]
				fits = LMA( solve.lma, K, logf, logNB);
				M.lma = fits.parameterValues[0];
			}

			if (solve.lfa)   // linear factor analysis for M using newton-raphson search over chi^2. UAYOR !  (compression off, interpolation on)
				M.lfa = LFA( solve.lfa, f, logNB);

			if (solve.bfs)  // brute force search for M
				M.bfs = BFS( solve.bfs, f, logNB);

			var 
				M0 = M[solve.$ || "lma"],
				snr = sqrt( Kbar / ( 1 + Kbar/M0 ) ),
				bias = sqrt( (N-1)/2 ) * exp(GAMMA.log((N-2)/2) - GAMMA.log((N-1)/2)),		// bias of snr estimate
				mu = (N>=4) ? (N-1) / (N-3) - bias**2 : 2.5;		// rel error in snr estimate

			cb({
				events: N,
				est: M,
				fits: fits,
				coherence_intervals: M0,
				mean_count: Kbar,
				mean_intensity: Kbar / T,
				degeneracyParam: Kbar / M0,
				snr: snr,
				complete: 1 - mu/2.5,
				coherence_time: T / M0,
				fit_stats: M
			});
		}

		else
			cb( null );
	},
	
	arrivalRates: function( solve, cb ) { // callback with arrival rate function 

		function getpcs(model, Emin, M, Mwin, Mmax, cb) {  // get or gen Principle Components with callback(pcs)

			$.thread( sql => {
				function genpcs(dim, steps, model, cb) {
					Log("gen pcs", dim, steps, model); 

					function evd( models, dim, step, cb) {
						models.forEach( function (model) {
							Log("pcs", model, dim, step);
							for (var M=1; M<dim; M+=step) {
								$( `
	t = rng(-T, T, 2*N-1);
	Tc = T/M;
	xccf = ${model}( t/Tc );
	Xccf = xmatrix( xccf ); 
	R = evd(Xccf); 
	`,  								{
										N: dim,
										M: M,
										T: 50
									}, ctx => {

									if (solve.trace)  { // debugging
										$(`
	disp({
	M: M,
	ccfsym: sum(Xccf-Xccf'),
	det: [det(Xccf), prod(R.values)],
	trace: [trace(Xccf), sum(R.values)]
	})`, ctx);
									}

	/*
	basis: R.vectors' * R.vectors,
	vecres: R.vectors*diag(R.values) - Xccf*R.vectors,
	*/
									cb({  // return PCs
										model: model,
										intervals: M,
										values: ctx.R.values._data,
										vectors: ctx.R.vectors._data
									});
								});
							}
						});
					}

					sql.beginBulk();

					evd( [model], Mmax, Mwin*2, pc => {
						var 
							vals = pc.values,
							vecs = pc.vectors,
							N = vals.length, 
							ref = $.max(vals);

						vals.forEach( (val, idx) => {
							var
								save = {
									correlation_model: pc.model,
									coherence_intervals: pc.intervals,
									eigen_value: val / ref,
									eigen_index: idx,
									ref_value: ref,
									max_intervals: dim,
									eigen_vector: JSON.stringify( vecs[idx] )
								};

							//Log(save);

							sql.query("INSERT INTO app.pcs SET ? ON DUPLICATE KEY UPDATE ?", [save,save] );
						});
					});

					sql.endBulk();
					cb();	
				}

				function sendpcs( pcs ) {
					var vals = [], vecs = [];

					//Log("sendpcs", pcs);
					pcs.forEach( function (pc) {
						vals.push( pc.eigen_value );
						vecs.push( JSON.parse( pc.eigen_vector ) );
					});

					cb({
						values: vals,
						vectors: vecs,
						ref: pcs[0].ref_value
					});
				}

				function findpcs( cb ) {
					var M0 = Math.min( M, Mmax-Mwin*2 );

					sql.query(
						"SELECT * FROM app.pcs WHERE coherence_intervals BETWEEN ? AND ? AND eigen_value / ref_value > ? AND least(?,1) ORDER BY eigen_index", 
						[M0-Mwin, M0+Mwin, Emin, {
							max_intervals: Mmax, 
							correlation_model: model
						}],
						function (err, pcs) {
							if (!err) cb(pcs);
					});
				}

				findpcs( pcs => {
					if (pcs.length) 
						sendpcs( pcs );

					else
					sql.query(
						"SELECT count(ID) as Count FROM app.pcs WHERE least(?,1)", {
							max_intervals: Mmax, 
							correlation_model: model
						}, 
						function (err, test) {  // see if pc model exists

						//Log("test", test);
						if ( !test[0].Count )  // pc model does not exist so make it
							genpcs( Mmax, Mwin*2, model, function () {
								findpcs( sendpcs );
							});

						else  // search was too restrictive so no need to remake model
							sendpcs(pcs);
					});							
				});
				
				sql.release();
			});
		}

		// Should add a ctx.Shortcut parms to bypass pcs and use an erfc model for the eigenvalues.

		getpcs( solve.model || "sinc", solve.min||0, solve.M, solve.Mstep/2, solve.Mmax, pcs => {

			//const { sqrt, random, log, exp, cos, sin, PI } = Math;

			/*
			function expdev(mean) {
				return -mean * log(random());
			}  */

			if (pcs) {
				var 
					pcRef = pcs.ref,  // [unitless]
					pcVals = pcs.values,  // [unitless]
					N = pcVals.length,
					T = solve.T,
					dt = T / (N-1),
					egVals = $(N, (n,e) => e[n] = solve.lambdaBar * dt * pcVals[n] * pcRef ),  // [unitless]
					egVecs = pcs.vectors;   // [sqrt Hz]

				if (N) {
					$( `
A=B*V; 
lambda = abs(A).^2 / dt; 
Wbar = {evd: sum(E), prof: sum(lambda)*dt};
evRate = {evd: Wbar.evd/T, prof: Wbar.prof/T};
x = rng(-1/2, 1/2, N); ` , 
						{
							T: T,
							N: N,
							dt: dt,

							E: $.matrix( egVals ),

							B: $(N, (n,B) => {
								var
									b = sqrt( $.expdev( egVals[n] ) ),  // [unitless]
									arg = random() * PI;

								Log(n,arg,b, egVals[n], T, N, solve.lambdaBar );
								B[n] = $.complex( b * cos(arg), b * sin(arg) );  // [unitless]
							}),

							V: egVecs   // [sqrt Hz]
						}, ctx => {
							cb({  // return computed stats
								intensity: {x: ctx.x, i: ctx.lambda},
								//mean_count: ctx.Wbar.evd,
								//mean_intensity: ctx.evRate.evd,
								eigen_ref: pcRef
							});
							Log({  // debugging
								mean_count: ctx.Wbar,
								mean_intensity: ctx.evRate,
								eigen_ref: pcRef
							});
						});	
				}

				else
					cb({
						error: `coherence intervals ${stats.coherence_intervals} > max pc dim`
					});
			}

			else
				cb({
					error: "no pcs matched"
				});
		});
	},
		
	estGauss: function (solve, evs, cb) {
		$.coherenceIntervals({
			f: solve.f,		// probability mass at each count level
			T: solve.T,  		// observation time [1/Hz]
			N: solve.Nevs,		// total number of events observed
			use: solve.Use || "lma",  // solution to retain
			lfa: solve.lfa || [50],  // initial guess at coherence intervals
			bfs: solve.bfs || [1,200,5],  // range and step to search cohernece intervals
			lma: solve.lma || [50]	// initial guess at coherence intervals
		}, coints => {
			$.arrivalRates({
				trace: false,   // eigen debug
				T: solve.T,  // observation interval  [1/Hz]
				M: coints.coherence_intervals, // coherence intervals
				lambdaBar: coints.mean_intensity, // event arrival rate [Hz]
				Mstep: 1,  // coherence step size when pc created
				Mmax: solve.Dim || 150,  // max coherence intervals when pc created
				model: solve.Model || "sinc",  // assumed correlation model for underlying CCGP
				min: solve.MinEigen || 0	// min eigen value to use
			}, rates => {

				if (evs)
					$.triggerProfile({
						refLambda: coints.mean_intensity, // ref mean arrival rate (for debugging)
						alpha: solve.Stats_Gain, // assumed detector gain
						N: solve.Dim, 		// samples in profile = max coherence intervals
						model: solve.Model,  	// name correlation model
						Tc: coints.coherence_time,  // coherence time of arrival process
						T: solve.T  		// observation time
					}, evs, trigs => {
						cb({
							coherenceInfo: coints,
							arrivalRates: rates,
							triggerProfile: trigs
						});
					});

				else
					cb({
						coherenceInfo: coints,
						arrivalRates: rates
					});
			});
		});
	},
	
	// linear algebra
	
	svd: function (a) {		// singular vakue decomposition
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
			del = N ? (max-min) / (N-1) : 1;
		
		return $.matrix( $( N || max-min, (n,R) => { R[n] = min; min+=del; } ) );
	},

	xcorr: function ( xccf ) { 	// sampled correlation matrix
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
	
	// hilbert and fourier transforms
	
	dht: function (f) {  //  discrete Hilbert transform
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
		
	dft: function (F) {		// discrete Fouier transform (unwrapped and correctly signed)
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

		g.$( n => {  // alternate signs to complete dft 
			var gn = g[n];
			g[n] = (n % 2) ? $.complex(-gn[0], -gn[1]) : $.complex(gn[0], gn[1]);
		});

		g.push( $.complex(0,0) );
		return $.matrix(g);
	},
		
	pwrem: function (nu, z) {  // paley-weiner remainder 
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
	
	pwrec: function (modH, z) {   //  paley-weiner reconstruction
	/* 
	Returns paley-weiner reconstructed trigger H(nu) = |H(nu)| exp( j*argH(nu) ) given its modulous 
	and its zeros z=[z1,...] in complex UHP.
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

	// power spectrums
	
	wkpsd: function (ccf, T) {  // weiner-kinchine psd
	/* 
	Returns weiner-kinchine psd [Hz] at frequencies nu [Hz] = [-f0 ... +f0] of a complex corr func 
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
		  
	psd: function (t,nu,T) {  // power spectral density
	/*
	Returns power spectral density [Hz] of events at times [t1,t2,...] over interval T [1/Hz] at the
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

	evpsd: function (evs,nu,T,idKey,tKey) {  // event based PSD
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
	
	// deviate generators
	
	udev: function (N,a) {  // uniform
	/* 
	Returns uniform random deviate on [0...a]
	*/
		return $.matrix( $(N, (n,R) => R[n] = a*random() ) );
	},
	
	expdev: function (N,a) {  // exponential
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
	
	// special functions
	
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
		
	zeta: function (a) {},
	infer: function (a) {},
	mle: function (a) {},
	mvn: function (a) {},
	lfa: function (a) {},
	lma: function (a) {},
	rnn: function (a) {},
	
	disp: function (a) {
		if ( isObject(a) )
			if (a._data)
				Log( a._data );
		
			else
			for (var key in a) Log(key, a[key]);
		
		else
			Log( a );
	}
};

$( $.extensions );

[ // add Jimp methods
	function save( file ) {
		var img = this;
		
		if ( file ) img.write( "." + (file || img.readPath) );	
		return img;
	},
	
	function sym( opts ) {	// symmetry over vertical axis (maps, limits, levels, noreflect)
		
		function remap(idx, levels, pix) {
			pix.X = pix.R - pix.G;
			pix.Y = pix.R - pix.B;
			pix.Z = pix.G - pix.B;
			
			pix.L = ( pix.R + pix.G + pix.B ) / 3;
			pix.S = 1 - min( pix.R, pix.G, pix.B ) / pix.L;
			pix.H = acos( (pix.X + pix.Y) / sqrt(pix.X**2 + pix.Y*pix.Z) / 2 ) * 360/Math.PI;
			
			return $( idx.length, (n,x) => x[n] = levler[ levels ? idx[n] : "U" ]( pix[ idx[n] ] , levels ) );
		}
		
		const {floor, acos, sqrt} = Math;
		
		var 
			img = this,
			levler = {
				R: (u,N) => floor( u * N / 256 ),
				G: (u,N) => floor( u * N / 256 ),
				B: (u,N) => floor( u * N / 256 ),
				L: (u,N) => floor( u * N / 256 ),
				S: (u,N) => floor( u * N ),
				H: (u,N) => floor( u * N / 360 ),
				U: (u,N) => u
			},
			bitmap = img.bitmap,
			data = bitmap.data,
			
			opts = Copy( opts || {}, {
				limits: {rows:0, cols:0},
				levels: {x: 0, y: 0},
				maps: {x: "RGB", y: "L"},
				reflect: true
			}, "."),
			limits = opts.limits, //Copy(limits || {}, {rows:0, cols:0}),
			levels = opts.levels, //Copy(levels || {}, {x: 0, y: 0}),
			maps = opts.maps, //Copy(maps || {}, {x: "RGB", y: "L"}),
			reflect = opts.reflect,
			
			Rows = bitmap.height,
			Cols = bitmap.width,
			rowReflect = floor(Rows/2), 	// halfway row
			rows = limits.rows ? min( limits.rows, rowReflect ) : rowReflect,
			cols = limits.cols ? min( limits.cols, Cols ) : Cols,
			X = $(cols),
			Y = $(cols),
			X0 = $(cols),
			Row = Rows-1,
			n0 = $(rowReflect, (n, n0) => n0[n] = Row-- ),
			rowSamples = $.rng(0,rowReflect)._data.shuffle(rows),
			red = 0, green = 1, blue = 2;

		Log( "sym", [Rows, Cols] , "->", [rows, cols], maps, limits, rowSamples.length );
		
		for (var col = 0; col<cols; col++) {
			var 
				x = X[col] = $(rows),
				y = Y[col] = $(rows),
				x0 = X0[col] = $(rowReflect);

			rowSamples.forEach( (row,n) => { // define (x,y) random training sets
				var
					Row = Rows - row - 1,	// reflected row
					idx = img.getPixelIndex( col, row ),
					pix = {R: data[ idx+red ] , G: data[ idx+green] , B: data[ idx+blue] },
					map = x[n] = remap( maps.x || "RGB", levels.x, pix),
					Idx = img.getPixelIndex( col, reflect ? Row : row ),	// sample is reflected by default
					Pix = {R: data[ Idx+red ] , G: data[ Idx+green] , B:data[ Idx+blue] },
					Map = y[n] = remap( maps.y || "L", levels.y, Pix);
			});

			n0.forEach( (row,n) => {		// define x0,n0 test set and index set
				var
					idx = img.getPixelIndex( col, row ),
					pix = {R: data[ idx+red ] , G: data[ idx+green] , B: data[ idx+blue] },
					map = x0[n] = remap( maps.x || "RGB", levels.x, pix);	// test data x0
			});
			
		}

		img.symmetries = {x: X, y: Y, x0: X0, n0: n0, input: img};
		return(img);
	}	
].Extend( IMP );

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
		$( " disp( pwrec( abs(sinc( rng(-4*pi,4*pi,511)) ) , [] ) )" );
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
			return k => _logp0(a,k,x);
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
			return k => _logp0(a,k,x);
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
		  ctx, ctx => {

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
		
		$(`svmTrain( x, y, {}, save );` ,  ctx, ctx => {

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
			
			$( `cls = ${met}Train(x,y,{}); y0 = ${met}Predict( cls, x0 );`, ctx, ctx => {
				Log(`unittest ${met}`, {x0: ctx.x0, y0: ctx.y0}, ctx.cls);
			});
		}
		break;
}

// UNCLASSIFIED
