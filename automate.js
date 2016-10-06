var phantom 		= require('phantom');
var mongoose        = require('mongoose');
var htmlparser		= require('htmlparser2')
var cheerio 		= require("cheerio");
var datetime		= require('node-datetime')
var Promise 		= require('bluebird');

PAGES = 40

// Database
mongoURI = process.env.MONGO_URI || 'mongodb://localhost/bit_mass';
mongoose.connect(mongoURI);
var db = mongoose.connection

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
 console.log('Mongodb connection open');
});
var massdb = db.collection('topaddr')

// Find Entry Only
exports.findEntry = function (entryDate, callback) {
  massdb.findOne({date: entryDate}, function(err, doc) {
    if (err) {
      console.log(err)
      return callback(err, null);
    }
    return doc ? callback(doc) : callback(null);
  })
};

// Create Entry Only
exports.createEntry = function(entry, callback){
	massdb.insert(entry, function(err, result){
		if (err) {
			console.log(err)
		} else {
			console.log("Inserted %d addresses", entry.addresses.length)
		}
	})
	return
}

// Find or Create Entry
exports.findOrCreateEntry = function (entry, callback) {

  exports.findEntry(entry.date, function(exists) {
    //if (exists) return callback(null, exists);
    if(exists) {
    	massdb.update({ date: entry.date},
    		{$addToSet: {
    			'addresses': { $each: entry.addresses }
    		}}, function(err, result){
			if (err) {
				console.log(err)
			} else {
				console.log("Updated with %d addresses", entry.addresses.length)
			}
		})
    	//console.log("Updated with %d addresses", addrList.length)
    } else {
		massdb.insert(entry, function(err, result){
			if (err) {
				console.log(err)
			} else {
				console.log("Inserted %d addresses", entry.addresses.length)
			}
		})
    }
    return
  });

}

var richList = Promise.method(function(condition, action, value) {
    if (!condition(value)) return value;
    return action(value).then(richList.bind(null, condition, action));
});

// Status 0 when successful. 1 repeats previous page scan
var status = 0
richList(function(count) {
    return count < PAGES;
}, function(count) {
	var _ph, _page, _outObj;
    return phantom.create().then(ph => {
		    _ph = ph;
		    return _ph.createPage();
		}).then(page => {
			page.setting('userAgent', 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36');
		    _page = page;
		    var page_num = count+1
		    var url = `http://www.bitcoinrichlist.com/top500?page=${page_num}`
		    return _page.open(url);
		    //return _page.open('output500.html');
		}).then(status => {
			console.log(status)
		    return _page.property('content')
		}).then(content => {

			var addr = [];
			var addr_list = []
			var $ = cheerio.load(content);
			$('.table td a.ng-binding').each(function(i, elem){
				if(($(this).parent().attr('class') !== 'ng-hide') && (typeof $(this).parent().attr('ng-hide') == "undefined")) {
					addr.push($(this).text())
				}
			})

			var countEpoch = count*500
			for (var i = 0; i < addr.length ; i++) {
				var address = {
						'rank' : countEpoch+(i+1),
						'address' : addr[i],
					}
				addr_list.push(address)	
			}
			console.log(addr_list)

			var dtime = datetime.create();
			var dt = dtime.format('Y-m-d')
			var entry = {
				'date' : dt,
				'addresses' : addr_list
			}
			if (addr_list.length > 0){
				console.log("Array")
				status = 0
				exports.findOrCreateEntry(entry)
			} else {
				console.log("No array")
				status = 1
			}


		}).then(function(res) { 
		    _page.close();
		    _ph.exit();
         	console.log(count)
         	// if no list is collected in first attempt, don't increment counter and try again
     		if (status == 0){
         		return ++count;
			} else {
				return count;
			}
     	}).catch(e => console.log(e))
}, 0).then(console.log.bind(console, 'Finished Collecting Addresses'));

exports.richList = richList;