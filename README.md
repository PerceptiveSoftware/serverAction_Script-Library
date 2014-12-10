serverAction_Script_Library
==================
----------


POST: /serverAction
-------------

This API call requests ImageNow Server to run the designated iScript. The ***serverActionRequest*** provides the structure for the request to ImageNow Server, and the ***serverActionResponse*** provides the optional response as an array of output parameters.


Input and output parameters are optional depending on the nature of the script. In the example below, the function of the script is to return the name of an ImageNow folder, and the script requires the unique folder ID to find and return the folder name.

**XML Request**


<serverActionRequest>
<mode>SCRIPT</mode>
<filePath>getFolderNameById.js</filePath>
<inputParams>
<inputParam>301YVD5_0001SVVK100000V</inputParam>
</inputParams>
</serverActionRequest>


**XML Response**

<serverActionResponse>
<outputParams>
<outputParam>January Invoices</outputParam>
</outputParams>
</serverActionResponse>



----------


**JSON Request**

{
"mode": "SCRIPT",
"filePath": "getFolderNameById.js",
"inputParams": [
"301YVD5_0001SVVK100000V"
]
}




**JSON Response**

{

"outputParams": [
"January Invoices"
]
}




To review the serverAction documentation [click here](https://docs.perceptivesoftware.com/robohelp/robo/server/6.7/PDM/en_US/Subsystems/integrationserver/Operations/ServerAction/POST___serverAction.htm).
