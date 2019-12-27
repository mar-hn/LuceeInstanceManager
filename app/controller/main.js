//Require
const electron = require('electron');
const app = electron.remote.app;
const remote = electron.remote;
const dialog = remote.dialog;
const fs = require('fs');
const ini = require('ini');
const {exec,execSync} = require('child_process');
const hostile = require('hostile');
const path = require('path');
//const sudo = require('sudo-prompt');

const Config = require('electron-config');
const config = new Config({
    defaults: 
    {
        navbarcolor: 'deep-orange',
        bshowapache: true,
        LuceePath: '/Applications/lucee',
        bToggleWebServers: true,
        nginxport: 80
    }
});

//Set navbar color
if(config.get('navbarcolor') != 'deep-orange')
    $('#navbar-main').removeClass('deep-orange').addClass(config.get('navbarcolor'));    

if(!config.get('bshowapache'))
{
  $("#apachelever").hide();
}

//Vars
//var LuceePath = "/Applications/lucee";
var LuceePath = config.get('LuceePath');
var NServers = "/usr/local/etc/nginx/servers/";
var LoggedUser = execSync(`sudo stat -f "%Su" /dev/console`,{encoding:"utf8"}).trim();

var LoaderHTML = 
`
 <div class="preloader-wrapper big active">
    <div class="spinner-layer spinner-blue-only">
      <div class="circle-clipper left">
        <div class="circle"></div>
      </div><div class="gap-patch">
        <div class="circle"></div>
      </div><div class="circle-clipper right">
        <div class="circle"></div>
      </div>
    </div>
  </div>  
`;

$.LoadingOverlaySetup({
    image           : "",
    custom          : LoaderHTML
});


//Document Ready
$(function() 
{
    $('.tooltipped').tooltip({
        delay: 50,
        position: 'top'
    });
    //RefreshStatus();
    $(".button-collapse").sideNav({
        closeOnClick: true
    });
    $('.modal').modal({
      ready: function(modal, trigger) { 
        $(this).find("[autofocus]").first().focus();
      }
    });

    RefreshStatus(true);

    //Check lucee was installed
    if(!FileExist(LuceePath,true))
    {
        dialog.showMessageBox({type:'error',title:'Error',detail: "Lucee installation not found"}, function() {});
        Materialize.toast('Lucee installation not found', 99000,"red");
        OpenSettings();
        throw("332 Lucee Not found");
    }    

    LoadTable();
});

var RTimer = setInterval(function(){
    RefreshStatus(true);
}, 60000);


/**
 * Start/Stop Lucee process
 * 
 * @param {any} action - Action
 * @param {Function} callback - Callback function
 * @param {number} [sleeptime=0] - Wait time it takes to run the command.
 */
function actionLucee(action,callback,sleeptime = 0)
{
  //Set default to none.
  if(typeof callback !== 'function') callback = function(){};
  
  sleep(sleeptime).then(() => 
  {
    switch(action)
    {
      case "start":
        execute(LuceePath + "/bin/catalina.sh start $@",
        function(output,stderr)
        {
          //RefreshStatus();
          if(!output.includes("Tomcat started") || stderr)
          {
            callback(true,output,stderr);
            return;
          }

          callback();
        });
        break;
      case "stop":
    
        execute(LuceePath + "/shutdown.sh",
        function(output,stderr)
        {
            //Remove warnings from stderr
            stderr = stderr.replace(/^ *(.*(?:warn|deprecated|ignoring|ignored).*)*$/mgi, '').trim();
            //Ignore white spaces and New lines from stderr
            stderr = stderr.replace(/\s+\n/g,'');

            //RefreshStatus();
            if( (output.includes("org.apache.catalina.startup")
            && !output.includes("SEVERE: Catalina.stop") ) || stderr)
            {
            if(sleeptime == 0)
            {
                actionLucee(action,callback,10000);
                return;
            }

            callback(true,output,stderr);
            return;
            }
            
            callback();
        });
      
      break;
    }
  });
}

/**
 * Start/Stop Nginx server process
 * 
 * @param {any} action - Command action
 * @param {any} callback - Callback function
 * @param {number} [sleeptime=0] - Wait time it takes to run the command.
 */
function actionNginx(action,callback,sleeptime = 0)
{
  //Set default to none.
  if(typeof callback !== 'function') callback = function(){};

  sleep(sleeptime).then(() => 
  {
    switch(action)
    {
      case "start":
        if(config.get('bToggleWebServers') && 
           $("#status_apache").prop("checked") &&
           sleeptime == 0)
        {
            actionApache("stop",function(bFailed)
            {
                if(bFailed)
                {
                    callback(true);
                    return;
                }

                $("#status_apache").prop("checked",false);
                actionNginx(action,callback,1000);
            });
            return;
        }

        execute("nginx",
        function(output,stderr)
        {
            if(stderr && stderr != "")
            {
              if(stderr.includes("Address already in use"))
                Materialize.toast('Failed to start Nginx, port already in use', 4000,"red");
              else
                Materialize.toast('Failed to start Nginx', 4000,"red");

              callback(true);
              console.error("Failed to "+action+" NGINX");
              console.error("Output->"+output);
              console.error("stdErr->"+stderr);
              dialog.showMessageBox({type:"error",
                                    message:"Error while starting nginx",
                                    detail:stderr+"\n"+output},
                                    function(){});                      
              return;
            }

            callback();
            Materialize.toast('Nginx has successfully started', 4000,"green");
        },true);
        break;
      case "stop":
        execute("nginx -s stop",
        function(output,stderr)
        {
            if(stderr && stderr != "")
            {            
              Materialize.toast('Failed to stop Nginx', 4000,"red");
              callback(true);            
              console.error("Failed to "+action+" NGINX");
              console.error("Output->"+output);
              console.error("stdErr->"+stderr);
              dialog.showMessageBox({type:"error",
                                    message:"Error while stopping nginx",
                                    detail:stderr+"\n"+output},
                                    function(){});               
              return;
            }

            callback();
            Materialize.toast('Nginx has successfully stopped', 4000,"green");
        },true);   
      break;
    }

  });

}

/**
 * Start/Stop Apache server process
 * 
 * @param {any} action - Command action
 * @param {any} callback - function callback
 * @param {number} [sleeptime=0] - Wait time it takes to run the command.
 */
function actionApache(action,callback,sleeptime = 0)
{
  //Set default to none.
  if(typeof callback !== 'function') callback = function(){};

  sleep(sleeptime).then(() => 
  {
    switch(action)
    {
      case "start":
        if(config.get('bToggleWebServers') && 
            $("#status_nginx").prop("checked") &&
            sleeptime == 0)
        {
            actionNginx("stop",function(bFailed)
            {
                if(bFailed)
                {
                    callback(true);
                    return;
                }

                $("#status_nginx").prop("checked",false);
                actionApache(action,callback,1000);
            });
            return;
        }
    
        execute("apachectl start",
        function(output,stderr)
        {
            if(stderr && stderr != "")
            {
              Materialize.toast('Failed to start Apache', 4000,"red");

              callback(true);
              console.error("Failed to "+action+" Apache");
              console.error("Output->"+output);
              console.error("stdErr->"+stderr);
              dialog.showMessageBox({type:"error",
                                    message:"Error while starting Apache",
                                    detail:stderr+"\n"+output},
                                    function(){});   
              return;
            }

            callback();
            Materialize.toast('Apache has successfully started', 4000,"green");
        });
        break;
      case "stop":
    
        execute("apachectl stop",
        function(output,stderr)
        {
            if(stderr && stderr != "")
            {            
              Materialize.toast('Failed to stop Apache', 4000,"red");
              callback(true);            
              console.error("Failed to "+action+" Apache");
              console.error("Output->"+output);
              console.error("stdErr->"+stderr);
              dialog.showMessageBox({type:"error",
                                    message:"Error while stopping Apache",
                                    detail:stderr+"\n"+output},
                                    function(){});                 
              return;
            }

            callback();
            Materialize.toast('Apache has successfully stopped', 4000,"green");             
        });   
      break;
    }
  });

}

/**
 * Sleep function. Waits a determined time.
 * 
 * @param {any} time 
 * @returns 
 */
function sleep (time) 
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Refresh the status of all instances
 * 
 * @param {Boolean} bForce - Force a reload.
 */
function RefreshStatus(bForce)
{
    var LProcess = 
    [
        '/usr/sbin/httpd -D FOREGROUND',    //Apache
        'nginx: master process nginx',      //Nginx
        'lucee'                             //Lucee
    ];
    
    //$FIX do it all at once to prevent issues.
    execute('ps -ef | grep -E "'+LProcess.join('|')+'" | grep -v grep',
    function(output)
    {
      //console.info(output);
      bApacheStatus = output.includes("httpd");
      bNginxStatus = output.includes("nginx");
      bLuceeStatus = output.includes("lucee")
      $('#status_apache').prop('checked',bApacheStatus);
      $('#status_nginx').prop('checked',bNginxStatus);
      $('#status_lucee').prop('checked',bLuceeStatus);
    },false);
}

/**
 * Executes a command line.
 * 
 * @param {String} command - Command line
 * @param {Function} callback - Callback function
 * @returns {void}
 */
function execute(command, callback,bAdmin)
{
   //$FIX Homebrew path fix.
   var PathFix = 'PATH="/usr/local/bin:${PATH}"';
   
   exec(PathFix + "&&" + command, function(error, stdout, stderr){
          //if(error && stdout != "") console.log("Error->"+error);
          //if(stderr) console.log("stderr->"+stderr);
          callback(stdout,stderr);
      });
      return;  
}


/**
 * Display instances data on main table.
 * It autorefresh the status of the instance at completion.
 */
function LoadTable()
{
    var Instances = getIList();
    var tbody = document.getElementById("rows");

    Instances.forEach(function(cItem,index)
    {
        if(cItem[0] != "localhost")
        {        
          let tr = createIRow(cItem,index);
          AddIRow(tr);
        }
    });

    //RefreshStatus(true);
}


/**
 * Appends a row element into table body.
 * 
 * @param {HTMLElement} row - Row element
 */
function AddIRow(row)
{
    var tbody = document.getElementById("rows");
    tbody.appendChild(row);
}

/**
 * Creates a row element.
 * 
 * @param {String} cItem - Instance ID
 * @returns {HTMLElement} - Table row
 */
function createIRow(Data,index)
{
    // Create row
    let tr = document.createElement("tr");

    //Set unique id
    tr.id = 'row_'+index;
    $(tr).attr('rowdata',Data[0]);

    //Create nodes
    //let td_id       = document.createElement("td");
    let td_hostname = document.createElement("td");
    let td_port     = document.createElement("td");        
    let buttons     = document.createElement("td");

    //Get Data
    var NPort = getNPort(Data[0]);
    var URL = (Data[0] != "" )  ? "http://"+Data[0] : "";
    var cssClass = "";

    if(NPort == "NULL")
        cssClass = "disabled";

    // Set Data
    //td_id.innerHTML       = index;
    td_hostname.innerHTML = Data[0];
    td_port.innerHTML = NPort;
    //$(td_port).addClass("center");
    
    
    buttons.innerHTML = 
    `
    <div class="center noselect">
    <a href="${URL}:${NPort}" id="btn_home_${index}" class="${cssClass} btn-floating btns_${index} btnHome"><i class="material-icons">home</i></a>
    <a href="${URL}:${NPort}/lucee/administrator/server.cfm" 
        class="btn-floating btns_${index} btnAdmin">
        <i class="material-icons">build</i>
    </a>
    <a id="btnedit_${index}" class="btn-floating btnRowEdit"><i class="material-icons">edit</i></a>
    </div>
    `
    
    //Events
    let btnEdit = $(buttons).find("#btnedit_"+index).click
    (
        function()
        {
            ShowEditItem($(this).parents('tr').children().first().html());
        }
    );
    
    //Append to table row
    //tr.appendChild(td_id);
    tr.appendChild(td_hostname);
    tr.appendChild(td_port);
    tr.appendChild(buttons);

    return tr;
}


/**
 * Show Edit tab of the specified instance.
 * 
 * @param {String} hostname - Instance hostname
 */
function ShowEditItem(hostname)
{
    //Set info
    var port = getNPort(hostname);
    $("#m_iname").html(hostname.toLowerCase());    
    $("#m_iport").html(port);
    $("#m_url").val(hostname);
    $("#m_folder").val(getNFolder(hostname));

    //$FIX Prevent warning.
    if(port != "NULL")
        $("#m_port").val(port);
    else
        $("#m_port").val("");
    
    //Scan for issues
    var bError = ScanForIssues(hostname);
    $("#txt_btn_msave").html((bError) ? "Fix & Save" : "Save");

    //Enable tab
    $('#tab_modify').removeClass('disabled');
    $('ul.tabs').tabs('select_tab', 'test2');
    Materialize.updateTextFields();
}

/**
 * Display what issues were found.
 * 
 * @param {String} hostname - Instance hostname
 * @returns {Boolean} - Issue found
 */
function ScanForIssues(hostname)
{
    let Result = getListIssues(hostname);

    //$("#st_serverxml"). html( getIcon(Result[0]) );
    $("#st_vhost").     html( getIcon(Result[0]) );
    $("#st_hostname").  html( getIcon(Result[1]) );
    
    //Return true if it had any error.
    return Result.includes(false);
}

/**
 * Get a Material Design Icon for issue status.
 * 
 * @param {Boolean} b 
 * @returns 
 */
function getIcon(b)
{
    var iSuccess = `<i class="material-icons green-text">check_circle</i>`;
    var iError = `<i class="material-icons red-text">error</i>`;

    return (b) ? iSuccess : iError;
}


/**
 * Get status of all issues.
 * 
 * @param {String} hostname - Instance hostname
 * @returns {Array} - Array
 */
function getListIssues(hostname)
{
    let LArray = 
    [
        //validInstance(hostname),                  //Worker Status
        getNConf(hostname).content != "NULL",       //VirtualHost Status
        isOnHostName(hostname),                     //Hostname Status
    ];
    return LArray;
}

/**
 * Checks if URL is on the hosts file.
 * 
 * @param {String} url - URL
 * @returns {Boolean} - true or false
 */
function isOnHostName(url)
{
    var HostArr = hostile.get(false);
    var bResult = HostArr.some(
    function(item)
    {
        return item.includes(url);
    });

    return bResult;
}

//Gets
/**
 * Gets a list with all Instances
 * 
 * @returns {Array} Array with all Lucee Instances
 */
function getIList(hostname)
{ 
    var xmlFile = LuceePath + "/conf/server.xml";
    // Check if file exist.
    if(!FileExist(xmlFile))
    {
        alert("server.xml was not found.");
        throw("334 server.xml not found");
    }

    //Get file
    var xmlFile = fs.readFileSync(xmlFile,'utf-8');
    var xmlDoc = $.parseXML(xmlFile);

    var List = [];
    var Elements = $(xmlDoc).find("Engine Host");

    for (var i = 0; i < Elements.length; i++) 
    {
        if(!hostname || hostname == $(Elements[i]).attr("name"))
          List.push([$(Elements[i]).attr("name"),$(Elements[i]).find("Context").attr('docBase')]);
    }

    return List;
}

/**
 * Get lucee instance folder from Nginx
 * 
 * @param {any} hostname
 * @returns {String} Folder Path
 */
function getNFolder(hostname)
{
  var NConf = getNConf(hostname).content;
  var Path = getMatches(CFile,/root\s([^\n*]+)/ig,1);
  if(Path.length > 0)
  {
    return RemoveTrailing(Path[0].trim());
  }
}

/**
 * Look for hostname conf and return it.
 * 
 * @param {any} hostname - Instance hostname
 * @returns {Object} - Struct object with Filename and FileContent
 */
function getNConf(hostname)
{
  var NCList = getConfFiles(NServers);
  //var result = "NULL";
  //var filename = "NULL";
  var result = {filename:"NULL",content:"NULL"};

  NCList.some(function(item)
  {
    strPath = path.join(NServers, item); 
    
    CFile = fs.readFileSync(strPath,'utf-8');
    if(CFile.includes('railo.conf'))
    {
      let CHost = getMatches(CFile,/server_name\s([^\n*]+)/ig,1);
      
      if(CHost.length > 0)
      {
        CHost = RemoveTrailing(CHost[0].trim());
        if(CHost.toLowerCase().trim() == hostname.toLowerCase().trim())
        {
          //result = CFile;
          //filename = item;
          result.filename = item;
          result.content = CFile;
          return true;
        }
      }
    }
  });

  return result;
}

/**
 * Remove trailing ; from a string
 * 
 * @param {any} str
 * @returns
 */
function RemoveTrailing(str)
{
  if(str.charAt(str.length - 1) == ';')
      str = str.slice(0, -1);
  
  return str;
}

/**
 * Get a list of Nginx Conf files.
 * 
 * @param {any} srcpath - Folder Path of Nginx Conf Folder
 * @returns {Array} - List of all available conf files.
 */
function getConfFiles(srcpath) 
{
  return fs.readdirSync(srcpath).filter
  (
    file => file.charAt(0) != '.' && file.split('.').pop() == 'conf'
  )
}


/**
 * Get instance Nginx Port
 * 
 * @param {any} hostname - Instance hostname
 * @returns {Number} - Port, null if it didnt find the instance.
 */
function getNPort(hostname)
{
  var Conf = getNConf(hostname).content;

  if(Conf == "NULL") return Conf;

  var port = getMatches(CFile,/listen\s([^\n*]+)/ig,1);
  if(port.length > 0)
  {
    port = RemoveTrailing(port[0].trim());
    return port;
  }  

  return "NULL";
}

/**
 * Add a VirtualHost Conf file to Nginx
 * 
 * @param {any} url - Instance URL
 * @param {any} folderpath - Instance WWW Folder
 * @param {any} port - Instance 
 * @returns {Boolean}
 */
function AddVNHost(url,folderpath,port)
{
    var Conf = getNConf(url);

    if(Conf.filename != "NULL") return false;

    var NewVHost = fs.readFileSync(__dirname + "/../misc/prototype.vhost",'utf8');
    NewVHost = NewVHost.replace(/{PATH}/ig,folderpath);
    NewVHost = NewVHost.replace(/{URL}/ig,url);
    NewVHost = NewVHost.replace(/{PORT}/ig,port);

    var NewPath = NServers + url.toLowerCase().replace(/\./g,'_')+'.conf';

    fs.writeFileSync(NewPath,NewVHost);
    return true;
}

/**
 * Update the VirtualHost of a instance
 * 
 * @param {any} oldURL - Old URL
 * @param {any} newURL - New URL
 * @param {any} folderpath - WWW Folder
 * @param {any} port - Nginx Port
 */
function UpdateVNHost(oldURL, newURL, folderpath,port)
{
    RemoveVNHost(oldURL);
    AddVNHost(newURL,folderpath,port);
}

/**
 * Remove the instance VirtualHost from NGINX
 * 
 * @param {String} url - Instance URL
 * @returns {Boolean}
 */
function RemoveVNHost(url)
{
    var Conf = getNConf(url);

    if(Conf.filename == "NULL") return false;
    fs.unlinkSync(NServers + Conf.filename);
    return true;
}

/**
 * Restarts Nginx server process
 */
function RestartNginx()
{
  execute(`nginx -s reload`,function(output,bfailed){},true);
}

/**
 * Restart lucee process
 * 
 * @param {Function} callback - Callback function
 */
function RestartLucee(callback)
{
    //Set default to none.
    if(typeof callback !== 'function') callback = function(){};

    if($('#status_lucee').prop("checked"))
    {
        actionLucee("stop",function(bFailed,output,stderr)
        {
            if(bFailed)
            {
                callback(true);
                HandleError("Lucee","restart",output,stderr);
                return;
            }

            actionLucee("start",function(bFailed,output,stderr)
            {
                if(bFailed)
                {
                    callback(true);
                    HandleError("Lucee","restart",output,stderr);
                    return;
                }
                
                console.info("Lucee restarted successfully")
                callback();
            });
        });
    }
    else
   {
       callback();
   }
}

/**
 * Get only specified group matches
 * 
 * @param {String} string - Content
 * @param {RegExp} regex - Regex
 * @param {Number} index - Group Index
 * @returns {Array} - Array with regex search result.
 */
function getMatches(string, regex, index) {
  index || (index = 1); // default to the first capturing group
  var matches = [];
  var match;
  while (match = regex.exec(string)) {
    matches.push(match[index]);
  }
  return matches;
}

/**
 * Execute a fix for all issues.
 * 
 * @param {String} id - Instance hsotname
 * @param {URL} url - WWW URL of instance
 * @param {String} FolderPath - Folder Path of instance
 * @param {Number} Port - Nginx Port
 */
function FixIssues(id,url,FolderPath,port)
{
    var LArray = getListIssues(id);
    id = id.toLowerCase();

    //Fix VirtualHost
    if(!LArray[0])
    {
       AddVNHost(url,FolderPath,port);
    }

    //Fix Hostname
    if(!LArray[1])
    {
        hostile.set('127.0.0.1',url);
    }

}

/**
 * Delete instance references
 * 
 * @param {any} url - Instance URL
 */
function DeleteReferences(url)
{
    var LArray = getListIssues(url);
    url = url.toLowerCase();

    // Clear reference from Workers.Properties
    if(LArray[0])
    {
      RemoveVNHost(url);
    }

    // Remove instance url from host file.
    if(LArray[1])
    {
        hostile.remove("127.0.0.1",url)
    }    
}

/**
 * Checks if instance exist
 * 
 * @param {any} url - Instance URL
 * @returns {Boolean}
 */
function instanceExist(url)
{
    var IList = getIList();
    var bFound = false;

    IList.forEach(function(cItem,index)
    {
        cItem[0] = cItem[0].toLowerCase();
        if(cItem[0].trim() == url.trim())
          bFound = true;
    });    

    return bFound;
}

/**
 * Checks if a folder exists.
 * 
 * @param {String} FolderPath - Folder Path
 * @returns {Boolean}
 */
function FolderExist(FolderPath)
{
    try 
    {
        fs.accessSync(FolderPath);
        return true;
    } catch (error) 
    {
        return false;
    }    
}

/**
 * Check if a file exist. Currently cached.
 * 
 * @param {String} path - Path to file
 * @param {Boolean} bForce - Whether to Ignore cache or not
 * @returns {boolean} - true or false
 */
function FileExist(path,bForce)
{
  return fs.existsSync(path);
}

/**
 * Add instance to lucee server.xml
 * 
 * @param {any} url
 * @param {any} folder
 * @returns
 */
function AddInstance(url,folder)
{
  url = url.toLowerCase();
  if(instanceExist(url)) return false;

  //Open File
  var xmlPathFile = LuceePath + "/conf/server.xml";
  var xmlFile = fs.readFileSync(xmlPathFile,'utf-8');
  
  //Setup Parser
  parser = new DOMParser();
  xmlDoc = parser.parseFromString(xmlFile,"text/xml");

  //Filter XML to only Engine
  Elements = xmlDoc.getElementsByTagName("Engine")[0];

  //Add new node to Engine tree
  newElement = xmlDoc.createElement("Host");

  //Set attributes
  $(newElement).attr('name',url);
  $(newElement).attr('appBase','webapps');

  //Add new node to this Host
  $(newElement).html(`<Context path="" docBase="${folder}" />`);

  //Append to Document.
  Elements.appendChild(newElement);

  //Convert new modified document
  var strXML = (new XMLSerializer()).serializeToString(xmlDoc);

  fs.writeFileSync(xmlPathFile,strXML);
  return true;
}

/**
 * Updates lucee instance in the server.xml
 * 
 * @param {any} oldurl
 * @param {any} newurl
 * @param {any} folder
 * @returns
 */
function UpdateInstance(oldurl,newurl,folder)
{
  oldurl = oldurl.toLowerCase();
  newurl = newurl.toLowerCase();

  if(!instanceExist(oldurl)) return false;

  //Open File
  var xmlPathFile = LuceePath + "/conf/server.xml";
  var xmlFile = fs.readFileSync(xmlPathFile,'utf-8');
  
  //Setup Parser
  parser = new DOMParser();
  xmlDoc = parser.parseFromString(xmlFile,"text/xml");

  //Filter XML to only Engine
  Elements = xmlDoc.getElementsByTagName("Engine")[0];
  
  //Remove Node.
  var node = $(Elements).find("[name='"+oldurl+"']");
  node.attr("name",newurl);
  node.find("Context").attr('docBase',folder);

  //Convert new modified document
  var strXML = (new XMLSerializer()).serializeToString(xmlDoc);

  fs.writeFileSync(xmlPathFile,strXML);
  return true;  
}

/**
 * Remove Instance from lucee server.xml
 * 
 * @param {any} url - Instance URL
 * @returns {Boolean}
 */
function RemoveInstance(url)
{
  url = url.toLowerCase();
  if(!instanceExist(url)) return false;

  //Open File
  var xmlPathFile = LuceePath + "/conf/server.xml";
  var xmlFile = fs.readFileSync(xmlPathFile,'utf-8');
  
  //Setup Parser
  parser = new DOMParser();
  xmlDoc = parser.parseFromString(xmlFile,"text/xml");

  //Filter XML to only Engine
  Elements = xmlDoc.getElementsByTagName("Engine")[0];
  
  //Remove Node.
  $(Elements).find("[name='"+url+"']").remove();

  //Convert new modified document
  var strXML = (new XMLSerializer()).serializeToString(xmlDoc);

  fs.writeFileSync(xmlPathFile,strXML);
  return true;
}

/**
 * Opens settings modal.
 */
function OpenSettings()
{
    $('#cnf_navcolor').val(config.get('navbarcolor'));
    $('#cnf_location').val(config.get('LuceePath'));
    $('#cnf_port').val(config.get('nginxport'));
    $('#cnf_ckshowapache').prop("checked",config.get('bshowapache'));
    $('#cnf_cktoggleservers').prop("checked",config.get('bToggleWebServers'));
    Materialize.updateTextFields();
    $("#mdl_config").modal('open');
}


// href fix for open in browser.
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault();
    //Open a webpage without root...
   execSync(`sudo -u ${LoggedUser} open ${this.href}`);
});

/**
 * Open Folder Dialog on Modify Tab
 *
 * @event btn_folder#click
 * @type {object}
 */
$("#btn_folder").click(function()
{
    //Show Dialog
    newPath = dialog.showOpenDialog({ defaultPath: $("#m_folder").val(), properties: ['openDirectory','createDirectory']});
    if(typeof newPath != "undefined")
    {
        //Display new path;
        $("#m_folder").val(newPath);
        Materialize.updateTextFields();
    }
});

$("#btn_cfolder").click(function()
{
    //Show Dialog
    newPath = dialog.showOpenDialog({ defaultPath: $("#c_folder").val(), properties: ['openDirectory','createDirectory']});
    if(typeof newPath != "undefined")
    {
        //Display new path;
        $("#c_folder").val(newPath);
        Materialize.updateTextFields();
    }
});


$("#btn_create").click(function()
{    
    $("#frm_create").trigger('reset');
    $('#c_port').val(config.get('nginxport'));
    Materialize.updateTextFields();
    $("#mdl_cinstance").modal('open');
});

$("#btn_refresh").click(function()
{
    location.reload();
});

$("#btn_msave").click(function()
{
    var id  = $("#m_iname").html().trim();
    var iport  = $("#m_iport").html().trim();
    var url = $("#m_url").val().trim();
    var Folder = $("#m_folder").val().trim();
    var port = $("#m_port").val();
    
    //Preliminary check
    if( url == "" || Folder == "" || port == "")
    {
        Materialize.toast('All fields are required.', 2000,"red");
        return;
    }

    // Check if url is already being used.
    if( (isOnHostName(url) && getNConf(url).content == "NULL") 
        || ( id != url && isOnHostName(url) ) )
    {
        Materialize.toast('URL is already being used, try another.', 2000,"red");
        return;
    }

    //Check if folder exists.
    if( !FolderExist(Folder) )
    {
        Materialize.toast('Please enter a valid folder.', 4000,"red");
        return;
    }

    $.LoadingOverlay("show");
    
    //Check if it has issues, if so Fix them.
    if($("#txt_btn_msave").html().includes("Fix"))
        FixIssues(id,url,Folder,port);

    //Update url and Folder, if it already exist.
    if(getNConf(id).content != "NULL") 
    {        
        hostile.remove('127.0.0.1',id);
        UpdateVNHost(id,url,Folder,port);
        hostile.set('127.0.0.1',url);
    }

    //Update info on Lucee Server.XML
    UpdateInstance(id,url,Folder);


    //Restart Nginx
    RestartNginx();

    //Restart Lucee
    RestartLucee(function(bFailed)
    {
        //$FIX Prevents the "Bad Gateway" error
        sleep("2000").then(() =>
        {
            //Refresh home url on main view.
            var Row = $("tr[rowdata='"+id+"']");
            Row.attr('rowdata',url);
            Row.children().first().html(url);
            Row.children().eq(1).html(port);
            Row.find(".btnHome").attr('href','http://'+url+':'+port);
            Row.find(".btnAdmin").attr('href','http://'+url+':'+port+'/lucee/administrator/server.cfm');
            //if($('#status_'+id).prop('checked'))
            Row.find('.btnHome').removeClass("disabled");
            Row.find('.btnAdmin').removeClass("disabled");
            
            //Update URL
            Row.attr("rowdata",url);
            //Disable tab and go to Main view.
            $('#tab_modify').addClass('disabled');
            $('ul.tabs').tabs('select_tab', 'test1');
            $.LoadingOverlay("hide");
        });        
    });    
});

$("#btn_csave").click(function()
{
    if( !$('#frm_create')[0].checkValidity() )
    {
        Materialize.toast('All fields are required', 4000,"red");
        $('#frm_create').find(':submit').click();
        return;
    }

    var url = $("#c_url").val().trim();
    var Folder = $("#c_folder").val().trim();
    var port = $("#c_port").val();
    
    
    if( instanceExist(url) )
    {
        Materialize.toast('URL already exists on Lucee', 2000,"red");
        return;
    }

    // Check if url is already being used.
    if( (isOnHostName(url) || getNConf(url).content != "NULL") )
    {
        Materialize.toast('URL is already being used, try another.', 2000,"red");
        return;
    }

    //Check if folder exists.
    if( !FolderExist(Folder) )
    {
        Materialize.toast('Please enter a valid folder.', 4000,"red");
        return;
    }

    $.LoadingOverlay("show");

    var newIndex = getIList().length;
    if( AddInstance(url,Folder) )
    {
        FixIssues(url,url,Folder,port);

        //Reload Nginx
        RestartNginx(); 

        //Restart Lucee
        RestartLucee(function(bFailed)
        {
            //$FIX Prevents the "Bad Gateway" error
            sleep("2000").then(() =>
            {
                //Add row to main table.
                let tr = createIRow([url,Folder],newIndex);
                //Hide first
                $(tr).hide();
                //Add it to table.
                AddIRow(tr);
                //Make a fade in effect.
                $(tr).fadeIn();

                $('#mdl_cinstance').modal('close');
                $.LoadingOverlay("hide");
                Materialize.toast('\''+ url + '\' was created successfully', 6000,"green");            
            });
        });

        return;
    }

    $.LoadingOverlay("hide");
    Materialize.toast('Error while creating instance. Check Logs', 6000,"red");
});


$("form",".modal").each(function()
{
    let mdl = $(this).parents('.modal');
    $(this).find('input').keypress(function(e) 
    {
        // Enter pressed?
        if(e.which == 10 || e.which == 13)
        { 
            $(mdl).find(".btnsubmit").click();
        }
    });
});

$("#btn_rdelete").click(function()
{
    var url = $("#m_iname").html();
    DeleteReferences(url);
    var Row = $("tr[rowdata='"+url+"']");    
    Row.children().eq(1).html(getNPort(url));
    Row.find(".btnHome").attr('href','');
    Row.find(".btnAdmin").attr('href','');
    Row.find('.btnHome').addClass("disabled");
    Row.find('.btnAdmin').addClass("disabled");
    ShowEditItem(url);
});

$("#btn_fdelete").click(function()
{
    var url = $("#m_iname").html();
    DeleteReferences(url);
    RemoveInstance(url);

    //Move to another tab.
    $('#tab_modify').addClass('disabled');
    $('ul.tabs').tabs('select_tab', 'test1');    

    //Fade out, and remove it after effect end.
    $("tr[rowdata='"+url+"']").fadeOut(function()
    {
        $(this).remove();
    });    
});

$("#btn_OpenDeleteDialog").click(function()
{   
    $('#modal1').modal('open');
});

$("#status_lucee").change(function()
{
    var item = $(this);
    var status = item.prop("checked");
    var action = status ? "start" : "stop";
    var txt = status ? "started" : "stopped";
    
    item.prop("disabled",true);
    actionLucee(action,
    function(bFailed,output,stderr)
    {
      if(bFailed)
      {
        item.prop("checked",!status);
        Materialize.toast('Failed to '+action+' lucee process', 4000,"red");
        HandleError("Lucee",action,output,stderr);
        RefreshStatus();
      }
        
      item.prop("disabled",false);
      Materialize.toast('Lucee has successfully '+txt, 4000,"green");
    });
});

/**
 * Error handler
 * 
 * @param {any} process - Process
 * @param {any} action - Action
 * @param {any} output - CMD Output
 * @param {any} stderr - CMD Error output
 */
function HandleError(process,action,output,stderr)
{
    if(!output) output = "";
    if(!stderr) stderr = "";

    console.error("Failed to "+action+" "+process);
    console.error("Output->"+output);
    console.error("stdErr->"+stderr);

    dialog.showMessageBox({type:"error",
                            message:'Failed to '+action+' '+process+' process',
                            detail:stderr+"\n"+output
                            },
                            function(){});        
}

$("#status_nginx").change(function()
{
    var item = $(this);
    var status = item.prop("checked");
    
    item.prop("disabled",true);
    actionNginx(status ? "start" : "stop",
    function(bFailed)
    {
      if(bFailed)
      {
        item.prop("checked",!status);
        RefreshStatus();
      }
        
      item.prop("disabled",false);
    });  
});

$("#status_apache").change(function()
{
    var item = $(this);
    var status = item.prop("checked");
    
    item.prop("disabled",true);
    actionApache(status ? "start" : "stop",
    function(bFailed)
    {
      if(bFailed)
      {
        item.prop("checked",!status);
        RefreshStatus();
      }
        
      item.prop("disabled",false);
    });    
});

$("#sn_about").click(function()
{
    var window = remote.getCurrentWindow();
    alert('Created by Mario Nuñez\n'+
          'github.com/mar-hn\ntwitter.com/marz_hn \n'+
          'Version ' + app.getVersion()) 
});

$("#sn_exit").click(function()
{
    var window = remote.getCurrentWindow();
    window.close();
});

$("#sn_devtools").click(function()
{
    var window = remote.getCurrentWindow();
    window.webContents.openDevTools()    
});

$("#sn_settings").click(function()
{   
    OpenSettings();
});

$("#btn_configsave").click(function()
{
    if( !$('#frm_config')[0].checkValidity() )
    {
        Materialize.toast('All fields are required', 4000,"red");
        $('#frm_config').find(':submit').click();
        return;
    }
        
    config.set('navbarcolor',$('#cnf_navcolor').val());
    config.set('LuceePath',$('#cnf_location').val());
    config.set('nginxport',$('#cnf_port').val());
    config.set('bshowapache',$('#cnf_ckshowapache').prop("checked"));
    config.set('bToggleWebServers',$('#cnf_cktoggleservers').prop("checked"));
    location.reload();
});