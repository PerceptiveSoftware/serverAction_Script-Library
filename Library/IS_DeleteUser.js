/********************************************************************************
	Copyright Perceptive Software 2013. All Rights Reserved.
	Reproduction and distribution of the contents of this work are prohibited without express and prior
	written consent of Perceptive Software. Use of this work without an active iScript license is prohibited.
	
	Name:				IS_DeleteUser.js
	Author:				Perceptive Software
	Created:			Brandon Crespino
	Last Updated:		12/10/2014
	ImageNow Version:	6.7+
---------------------------------------------------------------------------------
	Summary:
		The script inactivates an existing user in ImageNow.
		
	Mod Summary:
		
	Business Use:
		Inactivates users in ImageNow.
		
	Execution Method:
		This script is designed to be run from Integration Server POST: /serverAction.
		
********************************************************************************/

// *********************         Configuration        *******************

var PARAM_TOTAL					= 1;
var PARAM_USERNAME				= 0;

var returnVals = new Array();

/**
 * Main body of script.
 * @method main
 * @return {Boolean} True on success, false on error.
 */

function main ()
{
	try
	{
		
		var param = getInputParams();
		var param = new Array();
		
		if (param.length != PARAM_TOTAL)
		{
			printf("Expected Parameter Length: [%d].  Received: [%d], exiting\n", PARAM_TOTAL, param.length);
			returnVals.push("false");
			returnVals.push(Clib.rsprintf("Expected Parameter Length: [%d].  Received: [%d], exiting\n", PARAM_TOTAL, param.length));
			setOutputParams(returnVals);
			return false;
		}
		
		for (var i=0; i<param.length; i++)
			printf("param (%s) : [%s]\n", i, param[i]);
		
		var username = param[PARAM_USERNAME];
		
		printf("Preparing to perform script functionality on user: [%s].\n", username);
		
		var inUser = new INUser(username);
		if (!inUser || !inUser.getInfo())
		{
			printf("Failed to get user [%s]: %s\n", username, getErrMsg());
			returnVals.push("false");
			returnVals.push(Clib.rsprintf("Failed to get user [%s]: %s\n", username, getErrMsg()));
			setOutputParams(returnVals);
			return false;
		}
		else if (!inUser.setInfo({"state":"INACTIVE"}))
		{
			printf("Error setting user [%s] state to INACTIVE: %s\n", username, getErrMsg());
			returnVals.push("false");
			returnVals.push(Clib.rsprintf("Error setting user [%s] state to INACTIVE: %s", username, getErrMsg()));
			setOutputParams(returnVals);
			return false;
		}
		
		printf("Successfully executed the script.\n");
		
		returnVals.push("true");
		returnVals.push("IS_DeleteUser.js: Successfully executed the script");
		setOutputParams(returnVals);
		return true;
	}
	catch(e)
	{
		returnVals = new Array();
		returnVals.push("false");
		returnVals.push("Critical Error encountered.  Aborting script.");
		setOutputParams(returnVals);
		
		
	}

}