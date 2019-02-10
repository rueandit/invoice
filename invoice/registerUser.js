'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Register and Enroll users
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');

//
var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user_supplier = null;
var member_user_oem = null;
var member_user_bank = null;
var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:'+store_path);
var supplier_secret = null;
var oem_secret = null;
var bank_secret = null;

// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
Fabric_Client.newDefaultKeyValueStore({ path: store_path
}).then((state_store) => {
    // assign the store to the fabric client
    fabric_client.setStateStore(state_store);
    var crypto_suite = Fabric_Client.newCryptoSuite();
    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    var crypto_store = Fabric_Client.newCryptoKeyStore({path: store_path});
    crypto_suite.setCryptoKeyStore(crypto_store);
    fabric_client.setCryptoSuite(crypto_suite);
    var	tlsOptions = {
    	trustedRoots: [],
    	verify: false
    };
    // be sure to change the http to https when the CA is running TLS enabled
    fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', null , '', crypto_suite);

    // first check to see if the admin is already enrolled
    return fabric_client.getUserContext('admin', true);
}).then((user_from_store) => {
    if (user_from_store && user_from_store.isEnrolled()) {
        console.log('Successfully loaded admin from persistence');
        admin_user = user_from_store;
    } else {
        throw new Error('Failed to get admin.... run enrollAdmin.js');
    }

    // at this point we should have the admin user
    // first need to register the users with the CA server
    let attributes = [{name:"username", value:"IBM",ecert:true } , {name:"username", value:"Lotus",ecert:true } , {name:"username", value:"Unionbank",ecert:true }];

    return fabric_ca_client
        .register({enrollmentID: 'supplier', affiliation: 'org1.department1',role: 'supplier', attrs: attributes}, admin_user)
        .then((supplier)=>{
            supplier_secret = supplier;
            return fabric_ca_client
                .register({enrollmentID: 'oem', affiliation: 'org1.department1',role: 'oem', attrs: attributes}, admin_user)
                .then((oem)=>{
                    oem_secret = oem
                    return fabric_ca_client.register({enrollmentID: 'bank', affiliation: 'org1.department1',role: 'bank', attrs: attributes}, admin_user)
                })
        });

}).then((bank) => {

    bank_secret = bank
    // next we need to enroll the users with CA server
    console.log('Successfully registered supplier - secret:'+ supplier_secret);
    console.log('Successfully registered oem - secret:'+ oem_secret);
    console.log('Successfully registered bank - secret:'+ bank_secret);
    
    return fabric_ca_client
        .enroll({enrollmentID: 'supplier', enrollmentSecret: supplier_secret})
        .then(()=>{
            return fabric_ca_client
                .enroll({enrollmentID: 'oem', enrollmentSecret: oem_secret})
                .then(()=>{
                    return fabric_ca_client
                        .enroll({enrollmentID: 'bank', enrollmentSecret: bank_secret})
                })
        });

}).then((enrollment) => {
  console.log('Successfully enrolled member user "Supplier" , "OEM" , "Bank" ');
  
  return fabric_client
        .createUser({username: 'IBM',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }})
        .then(()=>{
            return fabric_client
                .createUser({username: 'Lotus',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }})
                .then(()=>{
                    return fabric_client.createUser({username: 'Unionbank',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }})
                })
        });

}).then((user) => {
    member_user_supplier = user;
    member_user_oem = user;
    member_user_bank = user;

     return fabric_client
        .setUserContext(member_user_supplier)
        .then(()=>{
            return fabric_client
            .setUserContext(member_user_oem)
            .then(()=>{
                return fabric_client
                    .setUserContext(member_user_bank)
            })
        });

}).then(()=>{
     console.log('3 users were successfully registered and enrolled and is ready to interact with the fabric network');

}).catch((err) => {
    console.error('Failed to register: ' + err);
	if(err.toString().indexOf('Authorization') > -1) {
		console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
		'Try again after deleting the contents of the store directory '+store_path);
	}
});
