serverAction_Script_Library
==========================


POST: /serverAction

This API call requests ImageNow Server to run the designated iScript. The serverActionRequest provides the structure for the request to ImageNow Server, and the serverActionResponse provides the optional response as an array of output parameters.

Input and output parameters are optional depending on the nature of the script. In the example below, the function of the script is to return the name of an ImageNow folder, and the script requires the unique folder ID to find and return the folder name.



Call Properties
REQUEST
Content
serverActionRequest
Content-Types
application/xml
application/json
RESPONSE

Content
serverActionResponse
Content-Types
application/xml
application/json
EXAMPLES

XML Request
<serverActionRequest>
<mode>SCRIPT</mode>
<filePath>getFolderNameById.js</filePath>
<inputParams>
<inputParam>301YVD5_0001SVVK100000V</inputParam>
</inputParams>
</serverActionRequest>
JSON Request
{
"mode": "SCRIPT",
"filePath": "getFolderNameById.js",
"inputParams": [
"301YVD5_0001SVVK100000V"
]
}
XML Response
<serverActionResponse>
<outputParams>
<outputParam>January Invoices</outputParam>
</outputParams>
</serverActionResponse>
JSON Response
{
"outputParams": [
"January Invoices"
]
}

Types
serverActionRequest
The serverActionRequest provides the structure for the POST: serverAction call, which is a request for ImageNow Server to execute an iScript. The inputParams are an optional part of the request, although the script may expect input parameters.

Request Summary
Data Type
Expected
Description
mode
String
Yes
The mode for the action. Integration Server supports the mode "SCRIPT," which requests ImageNow Server to run an iScript.
filePath
String
Yes
The name of the iScript for ImageNow Server to execute.
inputParams
List of strings
No
A list of parameters for ImageNow Server to pass to the script. You can access these parameters using getInputParams() from your script, which returns the parameters as an array of strings.
serverActionResponse
The serverActionResponse provides the structure for the POST: serverAction response, which returns the optional output parameters from the execution of the designated iScript.

Response Summary
Data Type
Expected
Description
outputParams
List of strings
No
The output parameters from the script. You set the setOutputParams() from the script. The setOutputParams() function takes an array as its argument.