var phantom = require('phantom');
var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');
var zipFolder = require('zip-folder');
var spawn = require('child_process').spawn;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var config = JSON.parse(fs.readFileSync("./config.json", 'utf8'));
var urlcapture; // = config.url + "/ccm/ccm_pic_get.jpg?hfrom_handle=887330&dsess=1&dsess_sn=" + config.camid + "&dtoken=p0_xxxxxxxxxx&dsess_nid=";

var FOLDER_SCREENSHOTS = "screenshots";
var FOLDER_ZIP = "zips";
var FOLDER_VIDEO = "videos";

//Fonction de formatage de la log
function log(title, msg) {
  console.log('[' + (new Date()).toISOString().replace('T', ' ').replace('Z', '') + '][' + title + '] ' + msg);
}

//Fonction qui zip les vieux repertoires
function createZip() {
  try {
    if (!fs.existsSync(FOLDER_ZIP)) {
      fs.mkdirSync(FOLDER_ZIP);
    }
    var dateref = (new Date()).toISOString().replace(/-|:/gi, '').substr(0, 8);
    var dirs = getDirs(FOLDER_SCREENSHOTS);
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var src = path.join(FOLDER_SCREENSHOTS, d);
      var dst = path.join(FOLDER_ZIP, d + ".zip");
      if (d !== dateref && !fs.existsSync(dst)) {
        zipFolder(src, dst, function(err) {
          if (err) {
            log("ZIPARCHIVE", 'Error: ' + src);
          } else {
            log("ZIPARCHIVE", 'Success: ' + src);
          }
        });
        break;
      }
    }
  } catch (e) {
    console.error(e);
  }
}

//Fonction qui crée une video a partir des images
function createVideo() {
  try {
    if (!fs.existsSync(FOLDER_VIDEO)) {
      fs.mkdirSync(FOLDER_VIDEO);
    }
    var dateref = (new Date()).toISOString().replace(/-|:/gi, '').substr(0, 8);
    var dirs = getDirs(FOLDER_SCREENSHOTS);
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var src = path.join(FOLDER_SCREENSHOTS, d);
      var dst = path.join(FOLDER_VIDEO, d + ".mp4");
      var imglist = path.join(FOLDER_VIDEO, d + ".txt");

      var jpgfiles = getJpg(src);
      jpgfiles.sort();
      var str = [];
      for (var j = 0; j < jpgfiles.length; j++) {
        str.push('file ' + path.join(src, jpgfiles[j]).replace(/\\/gi, '/'));
      }
      fs.writeFileSync(imglist, str.join('\r\n'));
      if (d !== dateref && !fs.existsSync(dst)) {
        var ffmpeg = spawn(config.ffmpeg_path, ['-y', '-r', '1/1', '-f', 'concat', '-safe', '0', '-i', imglist, '-c:v', 'libx264', '-vf', 'fps=25,format=yuv420p', dst]); //-y -r 1/5 -f concat -safe 0 -i "test.txt" -c:v libx264 -vf "fps=25,format=yuv420p" "out.mp4"
        /*
        ffmpeg.stdout.on('data', (data) => {
          console.log("data")
          console.log(data.toString());
        });
        ffmpeg.stdout.on('error', (data) => {
          console.log(data);
        });
        */
        break;
      }
    }
  } catch (e) {
    console.error(e);
  }
}

//Fonction qui retourne la liste images d'un repertoire
function getJpg(path) {
  return fs.readdirSync(path).filter(function(file) {
    return file.indexOf('.jpg');
  });
}

//Fonction qui retourne la liste des repertoires
function getDirs(path) {
  return fs.readdirSync(path).filter(function(file) {
    return fs.statSync(path + '/' + file).isDirectory();
  });
}

//Fonction qui supprime un repertoire et son contenu
function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

//Fonction qui utilise phantomjs pour recuperer un sessionNid
async function getSessionNid() {
  try {
    var instance = await phantom.create(['--ignore-ssl-errors=yes', '--load-images=true', '--web-security=false']);
    var page = await instance.createPage();
    await page.property('viewportSize', {
      width: 1920,
      height: 1080
    })
    var status = await page.open(config.url);
    if (status === "success") {
      //page.render("page.png");
      await page.on('onResourceRequested', function(requestData) {
        //console.info('Requesting', requestData.url.substr(0,250));
        if (requestData.url.indexOf('ccm_pic_get.jpg') > -1) {
          urlcapture = requestData.url;
          log('URLCAPTURE', urlcapture);
          instance.exit();
        }
      });
      await page.evaluate(function(config) {
        document.getElementById("signin_name").value = config.camid;
        document.getElementById("signin_show_pw").value = config.password;
        document.getElementById("signin_pw").value = config.password;
        document.getElementById("sign_in").click();
        //on emule un clic sur le bouton de capture
        setTimeout(function() {
          document.getElementById('camera_off_pic').click();
        }, 5000);
      }, config);
      //setTimeout(function(){page.render("page1.png")},10000);
      //setTimeout(function(){page.render("page2.png")},15000);
      //setTimeout(function(){page.render("page2.png")},20000);
    }
  } catch (e) {
    console.error(e);
  }
}

//Fonction qui fait une capture
function makeScreenshot() {
  if (!urlcapture) {
    return;
  }
  try {
    var filepath = getJpgFilePath();
    log('MAKESCREEN', filepath);
    var url = urlcapture; // + sessionnid;
    downloadFile(url, filepath);
  } catch (e) {
    console.error(e);
  }
}

//Fonction qui crée les répertoires necessaires et qui retourne le path du jpeg a créer
function getJpgFilePath() {
  var filepath;
  try {
    var dateref = (new Date()).toISOString().replace(/-|:/gi, '');
    if (!fs.existsSync(FOLDER_SCREENSHOTS)) {
      fs.mkdirSync(FOLDER_SCREENSHOTS);
    }
    var daypath = path.join(FOLDER_SCREENSHOTS, dateref.substr(0, 8));
    if (!fs.existsSync(daypath)) {
      fs.mkdirSync(daypath);
    }
    filepath = path.join(daypath, dateref.substr(9, 6) + ".jpg");
  } catch (e) {
    console.error(e);
  }
  return filepath;
}

//Fonction qui telecharge un fichier
function downloadFile(url, dest, callback) {
  try {
    var file = fs.createWriteStream(dest);
    var h = http;
    if (url.indexOf("https://") > -1) {
      h = https;
    }
    var request = h.get(url, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(callback); // close() is async, call callback after close completes.
      });
      file.on('error', function(err) {
        fs.unlink(dest); // Delete the file async. (But we don't check the result)
        if (callback)
          callback(err.message);
      });
    }).on('error', function(err) {
      console.info('Error downloading ' + url);
      //console.log(err);
    });
  } catch (e) {
    console.error(e);
  }
}


/******************
 *     STARTER     *
 ******************/
getSessionNid();
setInterval(function() {
  if (config.zip) {
    createZip();
  }
  if (config.video){
    createVideo();
  }
  getSessionNid();
}, 15 * 60 * 1000);

setInterval(function() {
  makeScreenshot();
}, 15 * 1000);