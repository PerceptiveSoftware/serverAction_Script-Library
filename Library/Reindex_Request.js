/********************************************************************************
	Copyright Perceptive Software 2014. All Rights Reserved.
	Reproduction and distribution of the contents of this work are prohibited without express and prior
	written consent of Perceptive Software. Use of this work without an active iScript license is prohibited.
	
	Name:			Reindex_Request.js
	Author:			Perceptive Software
	Created:		
	Last Updated:	
	For Version:	6.7
	Script Version: $Id$
---------------------------------------------------------------------------------
	Summary:
		This script will be run via integration server. It will be passed a list of doc IDs to process. Each
		document will then go through the following logic
			1) If status (field 4) is set to "Filed" then the document will be skipped
			2) Document will be reindexed according to configurations
			3) Document will be added to a configurable workflow queue
		After each document is processed, a new message will be written to the external message table that will be 
		used to trigger another script responsible for sending notification emails with a link to the specified 
		workflow queue.
		
		The script is expecting the inputParams field to be passed in the following format:
		 "inputParams": 
        ["321YY8X_0006CSBS300009W",
        "321YY8X_0006CZBS30000TC",
        "321YY8X_0006CXBS30000B3"]
		
	Mod Summary:
		
	Execution Method:
		This script is designed to be run from an integration server call
			
********************************************************************************/

// ********************* Include additional libraries *******************
//Linked Libraries
#link "secomobj" //COM object

//STL packages
#if defined(imagenowDir6)
	// 6.7.0.2717+, including Active-Active support
	#include "$IMAGENOWDIR6$/script/STL/packages/Logging/iScriptDebug.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Logging/StatsObject.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/System/generateUniqueID.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Properties/PropertyManager.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Date/convertToDateObj.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Document/toINKeys.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Object/getValueFromComplexArray.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Document/reindexDocument.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Workflow/createOrRouteItem.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Workflow/getQueueProcessors.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Array/inArray.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/User/getINEmailAddressForUser.js"
	#include "$IMAGENOWDIR6$/script/STL/packages/Email/iEmail.js"
#else
	// pre-6.7.0.2717, no Active-Active support
	#include "../script/STL/packages/Logging/iScriptDebug.js"
	#include "../script/STL/packages/Logging/StatsObject.js"
	#include "../script/STL/packages/System/generateUniqueID.js"
	#include "../script/STL/packages/Properties/PropertyManager.js"
	#include "../script/STL/packages/Date/convertToDateObj.js"
	#include "../script/STL/packages/Document/toINKeys.js"
	#include "../script/STL/packages/Object/getValueFromComplexArray.js"
	#include "../script/STL/packages/Document/reindexDocument.js"
	#include "../script/STL/packages/Workflow/createOrRouteItem.js"
	#include "../script/STL/packages/Workflow/getQueueProcessors.js"
	#include "../script/STL/packages/Array/inArray.js"
	#include "../script/STL/packages/User/getINEmailAddressForUser.js"
	#include "../script/STL/packages/Email/iEmail.js"
#endif

// *********************         Configuration        *******************

#define CONFIG_VERIFIED     true   // set to true when configuration values have been verified

//Logging
#define LOG_TO_FILE         true    // false - log to stdout if ran by intool, true - log to inserverXX/log/ directory
#define DEBUG_LEVEL         5       // 0 - 5.  0 least output, 5 most verbose
#define SPLIT_LOG_BY_THREAD false   // set to true in high volume scripts when multiple worker threads are used (workflow, external message agent, etc)
#define MAX_LOG_FILE_SIZE   100     // Maximum size of log file (in MB) before a new one will be created

//Defines the standard success/error codes and messages returned from the script
//<SuccessfulDocCount> will be replaced by a count of the number of documents processed without errors
//<FailedDocCount> will be replaced by a count of the number of documents encountering errors
//<SkippedDocCount> will be replaced by a count of the number of documents skipped due to already being filed
var SUCCESS_CODE = "0"
var SUCCESS_MSG  = "SUCCESS: <SuccessfulDocCount> document(s) were processed and <SkippedDocCount> document(s) were skipped";

var ERROR_CODE	 = "1"
var ERROR_MSG    = "ERRORS: <SuccessfulDocCount> document(s) were proccessed, <SkippedDocCount> document(s) were skipped and <FailedDocCount> document(s) encountered an error";			

//Indexing schema of the documents
var INDEX_SCHEMA = 
{
	"drawer" : {type: "LITERAL", source: "Backup", func: false}
}

//Routing options for the documents processed
var ROUTE_SCHEMA =
{
	successQueue : 
	[
		{type: "INDEX_KEY", source: "field3", func: false},
		{type: "LITERAL", source: " (Reindex Requested)", func: false}
	],
	errorQueue   : {type: "LITERAL", source: "Generic Lookup Error",   func: false},
}

//Message name and type for the EM messages being sent
var EM_TABLE_CONFIG =
{
	enabled:			false,	 	//Set to false to disable the EM messages
	message_name:		"Notification Email",
	message_type:		"iScript",
	request_type:		"Reindex_Request"
}

//If field4 is equal to any of the values in the configured array below, the document will be skipped. 
//This indicates the the return is already filed and no updates are allowed
//Setting this variable to "" will ensure that all documents are processed
var SKIP_DOC_INDICATORS = 
{
	"field4" : ["Filed"]
}

// *********************       End  Configuration     *******************

// ********************* Initialize global variables ********************
var EXECUTION_METHODS = ["EFORM"]; //Allowed script execution methods: WORKFLOW, INTOOL, TASK, EFORM, EMA
var debug;
var stats;
var pm = new PropertyManager();
var validIndexKey = {"drawer":1, "field1":1, "field2":1, "field3":1, "field4":1, "field5":1, "folder":1, "tab":1, "f3":1, "f4":1, "f5":1, "docTypeName":1, "name":1, "status":1}; //document keys and project keys

/**
 * Main body of script.
 * @method main
 * @return {Boolean} True on success, false on error.
 */
function main ()
{
	try
	{
		debug = new iScriptDebug("USE SCRIPT FILE NAME", LOG_TO_FILE, DEBUG_LEVEL, undefined, {splitLogByThreadID:SPLIT_LOG_BY_THREAD, maxLogFileSize:MAX_LOG_FILE_SIZE});
		debug.showINowInfo("INFO");
		debug.logAlways("INFO", "Script Version: $Id$\n");
		debug.logAlways("INFO", "Script Name: %s\n", _argv[0]);
		
		if (!CONFIG_VERIFIED)
		{
			var errorStr = "Configuration not verified.  Please verify \n" +
			"the defines in the *** Configuration *** section at the top \n" +
			"of this script and set CONFIG_VERIFIED to true.  Aborting.\n\n";
			debug.log("CRITICAL", errorStr);
			printf(errorStr);
			return false;
		}
		
		//check script execution
		if (!debug.checkExecution(EXECUTION_METHODS))
		{
			debug.log("CRITICAL", "This iScript is running as [%s] and is designed to run from [%s]\n", debug.getExecutionMethod(), EXECUTION_METHODS);
			return false;
		}
		stats = new StatsObject();
		
		var outputParams = new Array();
		var inputParams = new Array();
		var jsonObj;
		
		//read the input parameters from the POST: action and parse as needed
		try
		{
			inputParams = getInputParams();
			inputParams[0] = "[" + inputParams[0] + "]";
			jsonObj = eval(inputParams[0])[0];
			inputParams = new Array();
			for (eachDoc in jsonObj)
			{
				inputParams.push(jsonObj[eachDoc].documentId);
			}
			debug.logObject("DEBUG",inputParams,10,"Doc IDs to Process");
		}
		catch(e)
		{
			debug.log("ERROR", "Failed to read input parameters: %s\n", e.toString());
			outputParams[0] = ERROR_CODE;
			outputParams[1] = "Failed to read input parameters: " + e.toString();
			setOutputParams(outputParams);
			return false;
		}
		
		var allSuccessQueues = new Object();
		
		//Build the new document keys for all of the documents passed in the input parameters.
		documentLoop:
		for (i=0; i < inputParams.length; i++)
		{
			debug.log("DEBUG", "Now processing doc id[%s]\n", inputParams[i]);
			if (typeof(INFolder) != "undefined") docInfoParams = ["doc.id", "doc.name", "doc.drawer", "doc.field1", "doc.field2", "doc.field3", "doc.field4", "doc.field5", "doc.type"]; //6.7+
			else docInfoParams = ["doc.id", "doc.drawer", "doc.folder", "doc.tab", "doc.field3", "doc.field4", "doc.field5", "doc.type"]; //pre-6.7
			var doc = new INDocument(inputParams[i]);
			if (!doc.id || !doc.getInfo(docInfoParams))
			{
				debug.log("CRITICAL", "Couldn't get info for doc: %s\n", getErrMsg());
				stats.inc("Docs Failed");
				continue documentLoop;
				//throw  Clib.rsprintf("Couldn't get infor for doc[%s]. See log file for more details", inputParams[i] );
			}
			
			//Determine if the document should be skipped or not
			if (SKIP_DOC_INDICATORS)
			{
				for (condition in SKIP_DOC_INDICATORS)
				{
					if (validIndexKey[condition])
					{
						var val = doc[condition];
					}
					else
					{
						val = pm.get(doc, condition);
					}
					if (inArray(val, SKIP_DOC_INDICATORS[condition]))
					{
						debug.log("INFO", "Return is already filed. Updates are not allowed. Document[%s] will be skipped\n", doc);
						stats.inc("Docs Skipped");
						continue documentLoop;
					}
				}
			}
			
			//determine routing
			var errorQueue = getValueFromComplexArray(ROUTE_SCHEMA.errorQueue, doc, false, false, false);
			var successQueue = getValueFromComplexArray(ROUTE_SCHEMA.successQueue, doc, false, false, false);
			if (!allSuccessQueues[successQueue]) allSuccessQueues[successQueue] = true;
			
			//Build the new index keys and CPs for the document
			var newKeys = toINKeys(doc);
			var newCPs = new Array();
			for (eachField in INDEX_SCHEMA)
			{
				var docFailed = false;
				var newValue = getValueFromComplexArray(INDEX_SCHEMA[eachField], doc, false, false, false);
				if (!newValue)
				{
					debug.log("ERROR","Unable to determine new value for element[%s].\n", eachField );
					if (errorQueue) createOrRouteItem(doc, errorQueue, "Unable to determine new key/CP value");
					stats.inc("Docs Failed");
					continue documentLoop;
				}
				if (validIndexKey[eachField])
				{
					newKeys[eachField] = newValue;
				}
				else
				{
					newCPs.push({name:eachField,value:newValue});
				}
			}
			
			//reindex the document and update the custom properties according to the new values
			var newDoc = reindexDocument(doc, newKeys, 'APPEND');
			if (newDoc)
			{
				// Updating CPs of the Doc
				if (newCPs.length >0)
				{
					if(!pm.set(newDoc, newCPs) )
					{
						debug.log("ERROR","Document[%s] successfully re-indexed but failed to set Custom Properties.\n", newDoc );
						if (errorQueue) createOrRouteItem(newDoc, errorQueue, "Failed to set document custom properties");
						stats.inc("Docs Failed");
						continue documentLoop;
					}
				}
				debug.log("INFO","Document[%s] successfully reindexed and custom properties updated.\n", newDoc );
			}
			else
			{
				debug.log("ERROR", "Failed to reindex doc[%s] to new keys[%s]\n", doc, newKeys);
				if (errorQueue) createOrRouteItem(doc, errorQueue, "Failed to reindex document");
				stats.inc("Docs Failed");
				continue documentLoop;
			}
			
			//Add the document to the correct workflow queue
			if (successQueue) createOrRouteItem(newDoc, successQueue, "Successfully reindexed document");
			stats.inc("Docs Processed");
		}
		
		//Add a message to the EM table to trigger the email notification script
		if (EM_TABLE_CONFIG.enabled)
		{
			for(eachQueue in allSuccessQueues)
			{
				var successQueueObj = new INWfQueue("", eachQueue);
				var message = new INExternMsg();
				message.id = generateUniqueID();
				message.name = EM_TABLE_CONFIG.message_name;
				message.type = EM_TABLE_CONFIG.message_type;
				message.direction = ExternMsgDirection.Inbound;
				message.status = ExternMsgStatus.New;
				message.startTime = new Date();
				message.addProperty("queueID", ExternMsgPropType.Undefined, successQueueObj.id);
				message.addProperty("queueName", ExternMsgPropType.Undefined, successQueueObj.name);
				message.addProperty("requestType", ExternMsgPropType.Undefined, EM_TABLE_CONFIG.request_type);
				
				//send the message
				debug.log("DEBUG", "Sending EM message...\n");
				if (!message.send())
				{
					debug.log("ERROR", "Failed to send message [%s] to EM. Notification emails will not be sent: %s\n", message.name, getErrMsg());
				}
			}
			
		}
		
		//Return the output paramaters
		if (stats.get("Docs Failed") > 0)
		{
			var statusCode = ERROR_CODE;
			var msg = ERROR_MSG;
		}
		else
		{
			var statusCode = SUCCESS_CODE;
			var msg = SUCCESS_MSG;
		}
		var successfulDocCount = ((stats.get("Docs Processed") > 0) ? ToString(stats.get("Docs Processed")) : "0");
		var failedDocCount     = ((stats.get("Docs Failed") > 0) ? ToString(stats.get("Docs Failed")) : "0");
		var skippedDocCount    = ((stats.get("Docs Skipped") > 0) ? ToString(stats.get("Docs Skipped")) : "0");
		msg = msg.replace(/<FailedDocCount>/g, failedDocCount);
		msg = msg.replace(/<SuccessfulDocCount>/g, successfulDocCount);
		msg = msg.replace(/<SkippedDocCount>/g, skippedDocCount);
		outputParams[0] = statusCode;
		outputParams[1] = msg;
		setOutputParams(outputParams);
		
	}
	catch(e)
	{
		outputParams[0] = ERROR_CODE;
		outputParams[1] = "Fatal iScript Error encountered. Script has failed in an unexpected way. Please refer to log for more details";
		setOutputParams(outputParams);
		
		if (!debug)
		{
			printf("\n\nFATAL iSCRIPT ERROR: %s\n\n", e.toString());
		}
		else
		{
			debug.setIndent(0);
			debug.log("CRITICAL", "***********************************************\n");
			debug.log("CRITICAL", "***********************************************\n");
			debug.log("CRITICAL", "**                                           **\n");
			debug.log("CRITICAL", "**    ***    Fatal iScript Error!     ***    **\n");
			debug.log("CRITICAL", "**                                           **\n");
			debug.log("CRITICAL", "***********************************************\n");
			debug.log("CRITICAL", "***********************************************\n");
			debug.log("CRITICAL", "\n\n\n%s\n\n\n", e.toString());
			debug.log("CRITICAL", "\n\nThis script has failed in an unexpected way.  Please\ncontact Perceptive Software Customer Support at 800-941-7460 ext. 2\nAlternatively, you may wish to email support@perceptivesoftware.com\nPlease attach:\n - This log file\n - The associated script [%s]\n - Any supporting files that might be specific to this script\n\n", _argv[0]);
			debug.log("CRITICAL", "***********************************************\n");
			debug.log("CRITICAL", "***********************************************\n");
			if (DEBUG_LEVEL < 3 && typeof(debug.getLogHistory) === "function")
			{
				debug.popLogHistory(11);
				debug.log("CRITICAL", "Log History:\n\n%s\n\n", debug.getLogHistory());
			}
		}
	}
	finally
	{
		if (typeof(stats) == "object")
		{
			if (debug) debug.logAlways("NOTIFY", "Done:\n\n%s\n", stats.getSortedStats());
			else printf("Done:\n\n%s\n", stats.getSortedStats());
		}
		if (debug) debug.finish();
	}
}



// ********************* Function Definitions **********************************

// custom functions go here...

//-- last line must be a comment --