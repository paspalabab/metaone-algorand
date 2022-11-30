import { multisigAddress } from "algosdk";
import assert from "assert";
const fs = require("fs");
const path = require("path");
const algosdk = require('algosdk');
const utils = require('./utils');

const kmdtoken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const kmdserver = 'http://94.74.95.107';
const kmdport = '4002';
const kmdclient = new algosdk.Kmd(kmdtoken, kmdserver, kmdport);

const algod_token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const algod_server = "http://94.74.95.107"
const algod_port = "4001"
const algoclient = new algosdk.Algodv2(algod_token, algod_server, algod_port);

const walletname = 'Metaone3';

let walletid = null;
let wallethandle = null;

let sponsor = null;
let sponsor_key = null;
let sponsor_nm = null;

let account1:String = null;
let accountKey1 = null;
let nm1 = null;
let account2:String = null;
let accountKey2 = null;
let nm2 = null;
let account3:String = null;
let accountKey3 = null;
let nm3 = null;

let multsigaddr = null;

let appid = null;
let appAddress = null;
let asset_for_payment: Number = 0;
let asset_for_lease: Number = 0;

function logBold(message:String) {
    console.log(`${utils.fmt.bold}${message}${utils.fmt.reset}`);
}

async function getBasicProgramBytes(client, program) {
    // use algod to compile the program
    const compiledProgram = await client.compile(program).do();``
    // console.log(`compiledProgram: ${compiledProgram}`);
    return new Uint8Array(Buffer.from(compiledProgram.result, 'base64'));
}

async function verboseWaitForConfirmation(client, txnId) {
    console.log('Awaiting confirmation (this will take several seconds)...');
    const roundTimeout = 2;
    const completedTx = await utils.waitForConfirmation(
      client,
      txnId,
      roundTimeout
    );
    console.log('Transaction successful.');
    return completedTx;
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}


describe('metaone algo tests...', () => {
    
    const pay_start_algo = async (algod_client, sponsor, sponsorkey, reciever, amount) => {

        // Construct the transaction
        let params = await algod_client.getTransactionParams().do();
        // comment out the next two lines to use suggested fee
        params.fee = 1000;
        params.flatFee = true; 
        const enc = new TextEncoder();     
        const note = enc.encode("Hello World");

        let txn = algosdk.makePaymentTxnWithSuggestedParams(sponsor, reciever, amount, undefined, note, params);

        const signedTxn = txn.signTxn(sponsorkey.private_key);
        let txId = txn.txID().toString();
        console.log("Signed transaction with txID: %s", txId);
        
        // print transaction data
        const decoded = algosdk.decodeSignedTransaction(signedTxn);
        console.log(decoded);

        // Submit the transaction
        await algod_client.sendRawTransaction(signedTxn).do();       

        // Wait for confirmation
        let confirmedTxn = await algosdk.waitForConfirmation(algoclient, txId, 4);
        //Get the completed Transaction
        console.log("Transaction " + txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
        let mytxinfo = JSON.stringify(confirmedTxn.txn.txn, undefined, 2);
        // console.log("Transaction information: %o", mytxinfo);
        let string = new TextDecoder().decode(confirmedTxn.txn.txn.note);
        // console.log("Note field: ", string);     

    }

    before(async () => {

        // create new wallet and accounts
        try 
        {
            walletid = (await kmdclient.createWallet(walletname, "", "", "sqlite")).wallet.id;
            console.log("Created wallet:", walletid);

            wallethandle = (await kmdclient.initWalletHandle(walletid, "")).wallet_handle_token;
            console.log("Got wallet handle:", wallethandle);
        
            console.log("Created new account:", (await kmdclient.generateKey(wallethandle)).address);
            console.log("Created new account:", (await kmdclient.generateKey(wallethandle)).address);
            console.log("Created new account:", (await kmdclient.generateKey(wallethandle)).address);
        } catch (err) {
          console.log(err.response.body);
        }

        // get the account with funds
        let wallets = (await kmdclient.listWallets()).wallets;
        wallets.forEach(function (arrayItem) {
            if( arrayItem.name === 'unencrypted-default-wallet'){
                walletid = arrayItem.id;
            }
        });

        wallethandle = (await kmdclient.initWalletHandle(walletid, "")).wallet_handle_token;
        // console.log("Got wallet handle:", wallethandle);

        let accounts = await kmdclient.listKeys(wallethandle);
        sponsor = accounts.addresses[0];
        console.log('\nSponsor: ', sponsor);
        sponsor_key = (await kmdclient.exportKey(wallethandle, "", sponsor ));   
        sponsor_nm = (await algosdk.secretKeyToMnemonic(sponsor_key.private_key));
        console.log("Mnemonic: ", sponsor_nm);        

        try 
        {
            let wallets = (await kmdclient.listWallets()).wallets;
            wallets.forEach(function (arrayItem) {
                if( arrayItem.name === walletname){
                    walletid = arrayItem.id;
                }
            });
    
            wallethandle = (await kmdclient.initWalletHandle(walletid, "")).wallet_handle_token;
            // console.log("Got wallet handle:", wallethandle);
    
            let accounts = await kmdclient.listKeys(wallethandle);
            // console.log(accounts);
    
            account1 = accounts.addresses[0];
            console.log('\nAccount1: ', account1);
            accountKey1 = (await kmdclient.exportKey(wallethandle, "", account1 ));
            nm1 = (await algosdk.secretKeyToMnemonic(accountKey1.private_key));
            console.log("Mnemonic: ", nm1);
    
            account2 = accounts.addresses[1];
            console.log('\nAccount2: ', account2);
            accountKey2 = (await kmdclient.exportKey(wallethandle, "", account2 ));
            nm2 = (await algosdk.secretKeyToMnemonic(accountKey2.private_key));
            console.log("Mnemonic: ", nm2);
    
            account3 = accounts.addresses[2];
            console.log('\nAccount3: ', account3);
            accountKey3 = (await kmdclient.exportKey(wallethandle, "", account3 ));
            nm3 = (await algosdk.secretKeyToMnemonic(accountKey3.private_key));
            console.log("Mnemonic: ", nm3);
            console.log("\n");
    
            //Setup the parameters for the multisig account
            const mparams = {
                version: 1,
                threshold: 2,
                addrs: [
                    account1,
                    account2,
                    account3,
                ],
            };
            multsigaddr = algosdk.multisigAddress(mparams);
            console.log(`Multisig account: ${multsigaddr}\n`);

            const addrs = [];
            for (let i = 0; i < mparams.addrs.length; i++) {
              addrs.push(
                Buffer.from(
                  algosdk.decodeAddress(mparams.addrs[i]).publicKey
                ).toString('base64')
              );
            }


            let accountInformation = await algoclient.accountInformation(
                account1
            ).do();
            if(accountInformation.amount < 100000000 + accountInformation['min-balance']) {
                await pay_start_algo(algoclient, sponsor,sponsor_key,account1, 1000000000);
            }

            accountInformation = await algoclient.accountInformation(
                account2
            ).do();
            if(accountInformation.amount < 100000000 + accountInformation['min-balance']) {
                await pay_start_algo(algoclient, sponsor,sponsor_key,account2, 1000000000);
            }

            accountInformation = await algoclient.accountInformation(
                account3
            ).do();
            if(accountInformation.amount < 100000000 + accountInformation['min-balance']) {
                await pay_start_algo(algoclient, sponsor,sponsor_key,account3, 1000000000);
            }

            accountInformation = await algoclient.accountInformation(
                multsigaddr
            ).do();
            if(accountInformation.amount < 100000000 + accountInformation['min-balance']) {
                await pay_start_algo(algoclient, sponsor,sponsor_key, multsigaddr, 1000000000);
            }

            await kmdclient.importMultisig(
                wallethandle,
                mparams.version,
                mparams.threshold,
                addrs
              );
            console.log("\nMultisig account list: ", await kmdclient.listMultisig(wallethandle));

        } catch (err) {
            if(err.response.body.message != "key already exists in wallet")  {
                console.log(err);
                assert.fail();
            }
        }
    });


    it('create asset for rent payments', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        // create a multisig account
        const multiSigOptions = {
            version: 1,
            threshold: 2,
            addrs: [account1, account2, account3],
        };        

       // create the asset creation transaction
       const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            from: multsigaddr,
            total: 1000,
            decimals: 0,
            assetName: 'MTONE',
            unitName: "MT",
            assetURL: "http://example/asset/metaone",
            assetMetadataHash: "",
            defaultFrozen: false,

            freeze: multsigaddr,
            manager: multsigaddr,
            clawback: multsigaddr,
            reserve: multsigaddr,

            suggestedParams,
        });

        // sign transaction
        const signature1 = algosdk.signMultisigTransaction(
            txn,
            multiSigOptions,
            accountKey1.private_key
        );
        const signature2 = algosdk.signMultisigTransaction(
            txn,
            multiSigOptions,
            accountKey2.private_key
        );
        const stxn = algosdk.mergeMultisigTransactions([
            signature1.blob,
            signature2.blob,
        ]);

        // send the transaction
        logBold('Sending application call transaction.');
        const { txId: callTxnId } = await algoclient
            .sendRawTransaction(stxn)
            .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, callTxnId);

        asset_for_payment = completedTx['asset-index']
        console.log(`Asset for payments: ${asset_for_payment}`);

        const assetInformation = await algoclient.accountAssetInformation(
            multsigaddr,
            asset_for_payment
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_payment);
        assert.equal(assetInformation['asset-holding']['amount'], 1000);

    });     


   it('the lender optin the asset for rent payments', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        // create the asset accept transaction
        const transactionOptions = {
            from: account2,
            to: account2,
            assetIndex: asset_for_payment,
            amount: 0,
            suggestedParams,
        };

        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(
            transactionOptions
        );

        // send the transaction
        logBold('Sending application opt in transaction.');
        const signedOptInTxn = txn.signTxn(accountKey2.private_key);
        const { txId: optInTxId } = await algoclient
        .sendRawTransaction(signedOptInTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, optInTxId);       

        const assetInformation = await algoclient.accountAssetInformation(
            account2,
            asset_for_payment
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_payment);
        assert.equal(assetInformation['asset-holding']['amount'], 0);

    });

    it('the borrower optin the asset for rent payments', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        // create the asset accept transaction
        const transactionOptions = {
            from: account3,
            to: account3,
            assetIndex: asset_for_payment,
            amount: 0,
            suggestedParams,
        };

        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(
            transactionOptions
        );

        // send the transaction
        logBold('Sending application opt in transaction.');
        const signedOptInTxn = txn.signTxn(accountKey3.private_key);
        const { txId: optInTxId } = await algoclient
        .sendRawTransaction(signedOptInTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, optInTxId);       

        const assetInformation = await algoclient.accountAssetInformation(
            account3,
            asset_for_payment
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_payment);
        assert.equal(assetInformation['asset-holding']['amount'], 0);

    });


    it('transfer all the assets for payment to borrower', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        // create a multisig account
        const multiSigOptions = {
            version: 1,
            threshold: 2,
            addrs: [account1, account2, account3],
        };        

        // create the asset transfer transaction
        const transactionOptions = {
            from: multsigaddr,
            to: account3,
            closeRemainderTo: undefined,
            amount: 1000,
            assetIndex: asset_for_payment,
            suggestedParams,
        };

        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(
            transactionOptions
        );

        // sign transaction
        const signature1 = algosdk.signMultisigTransaction(
            txn,
            multiSigOptions,
            accountKey1.private_key
        );
        const signature2 = algosdk.signMultisigTransaction(
            txn,
            multiSigOptions,
            accountKey2.private_key
        );
        const stxn = algosdk.mergeMultisigTransactions([
            signature1.blob,
            signature2.blob,
        ]);

        // send the transaction
        logBold('Sending application call transaction.');
        const { txId: callTxnId } = await algoclient
            .sendRawTransaction(stxn)
            .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, callTxnId);

        const assetInformation = await algoclient.accountAssetInformation(
            account3,
            asset_for_payment
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_payment);
        assert.equal(assetInformation['asset-holding']['amount'], 1000);


    });     

    it('create asset for lease', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

       // create the asset creation transaction
       const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            from: account2,
            total: 1,
            decimals: 0,
            assetName: 'ART_GAME',
            unitName: "ART",
            assetURL: "http://example/asset/artgame",
            assetMetadataHash: "",
            defaultFrozen: false,

            freeze: undefined,
            manager: undefined,
            clawback: undefined,
            reserve: undefined,

            suggestedParams,
        });


        // send the transaction
        logBold('Sending application opt in transaction.');
        const signedTxn = txn.signTxn(accountKey2.private_key);
        const { txId: txId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, txId);

        asset_for_lease = completedTx['asset-index']
        console.log(`Asset for lease: ${asset_for_lease}`);

        const assetInformation = await algoclient.accountAssetInformation(
            account2,
            asset_for_lease
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_lease);
        assert.equal(assetInformation['asset-holding']['amount'], 1);


    });     

    it('deploy contract', async () => {

        const admin_accountInformation_pre = await algoclient.accountInformation(
            account1
        ).do();
       
        let approval_path = path.join(__dirname, '..', '..', 'build', 'approval.teal');
        let clear_path = path.join(__dirname, '..', '..', 'build', 'clear.teal');

        let approval = fs.readFileSync(approval_path);
        let clear = fs.readFileSync(clear_path);

        // console.log(`approval: ${approval}`);
        // console.log(`clear: ${clear}`);

        // define application parameters
        const from = account1;
        const onComplete = algosdk.OnApplicationComplete.NoOpOC;
        const approvalProgram = await getBasicProgramBytes(algoclient, approval);
        const clearProgram = await getBasicProgramBytes(algoclient, clear);
        const numLocalInts = 9 + 1;
        const numLocalByteSlices = 1;
        const numGlobalInts = 4;
        const numGlobalByteSlices = 1;
        const accounts = [account1];

        // console.log(`approvalProgram: ${approvalProgram}`);
        // console.log(`clearProgram: ${clearProgram}`);

        const enc = new TextEncoder();     
        const appArgs = [enc.encode("set_admin")];

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();        

        // create the application creation transaction
        const createTxn = algosdk.makeApplicationCreateTxn(
            account1,
            suggestedParams,
            onComplete,
            approvalProgram,
            clearProgram,
            numLocalInts,
            numLocalByteSlices,
            numGlobalInts,
            numGlobalByteSlices,
            appArgs,
            accounts
        );

        // send the transaction
        logBold('Sending application creation transaction.');
        const signedCreateTxn = createTxn.signTxn(accountKey1.private_key);
        const { txId: createTxId } = await algoclient
        .sendRawTransaction(signedCreateTxn)
        .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, createTxId);

        appid = completedTx['application-index'];
        console.log(`appid = ${appid}`);

        appAddress = algosdk.getApplicationAddress(appid);
        await pay_start_algo(algoclient, sponsor,sponsor_key, appAddress, 200000);


        const appInformation = await algoclient.accountApplicationInformation(
            account1,
            appid
        ).do();

        assert.equal(appInformation['created-app']['global-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['created-app']['global-state-schema']["num-uint"], 4);
        assert.equal(appInformation['created-app']['local-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['created-app']['local-state-schema']["num-uint"], 10);

        for (var item of appInformation['created-app']['global-state']) {
            switch(Buffer.from(item.key, "base64").toString()){
                case 'currency':
                    assert.equal(item.value.uint, 0);
                break;
                case 'plat_admin':
                    assert.equal(algosdk.encodeAddress(new Uint8Array(Buffer.from(item.value.bytes, "base64"))), account1);
                break;
                case 'set_rate_denominator':
                    assert.equal(item.value.uint, 0);
                break;
                case 'set_rate_numerator':
                    assert.equal(item.value.uint, 0);
                break;
                default:
                    assert.fail();
            }
        }

        const admin_accountInformation_after = await algoclient.accountInformation(
            account1
        ).do();
        console.log(`Just spent ${admin_accountInformation_pre.amount - admin_accountInformation_after.amount} microAlgos to deploy a contract`)

    }); 

    it('change admin to multisig account', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        const enc = new TextEncoder();     
        const appArgs = [enc.encode("set_admin")];
        const accounts = [multsigaddr];                

        const callTxn = algosdk.makeApplicationNoOpTxn(
            account1,
            suggestedParams,
            appid,
            appArgs,
            accounts
        );

        // send the transaction
        logBold('Sending application call transaction.');
        const signedCallTxn = callTxn.signTxn(accountKey1.private_key);
        const { txId: callTxnId } = await algoclient
            .sendRawTransaction(signedCallTxn)
            .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, callTxnId);
        console.log(completedTx);

        const appInformation = await algoclient.getApplicationByID(appid).do();

        assert.equal(appInformation['params']['global-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['params']['global-state-schema']["num-uint"], 4);
        assert.equal(appInformation['params']['local-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['params']['local-state-schema']["num-uint"], 10);

        for (var item of appInformation['params']['global-state']) {
            switch(Buffer.from(item.key, "base64").toString()){
                case 'currency':
                    assert.equal(0, item.value.uint);
                break;
                case 'plat_admin':
                    assert.equal(algosdk.encodeAddress(new Uint8Array(Buffer.from(item.value.bytes, "base64"))), multsigaddr);
                break;
                case 'set_rate_denominator':
                    assert.equal(0, item.value.uint);
                break;
                case 'set_rate_numerator':
                    assert.equal(0, item.value.uint);
                break;
                default:
                    assert.fail();
            }
        }

        
    }); 

    it('set fee', async () => {

        const denominator = 10;
        const numerator = 1;

        // get suggested params
        let suggestedParams = await algoclient.getTransactionParams().do();  
        suggestedParams.fee = 2000;
        suggestedParams.flatFee = true;        

        // create a multisig account
        const multiSigOptions = {
            version: 1,
            threshold: 2,
            addrs: [account1, account2, account3],
        };

        const enc = new TextEncoder();     
        let appArgs = [enc.encode("set_fee")];
        // appArgs.push(new Uint8Array(asset_for_payment));
        appArgs.push(algosdk.encodeUint64(asset_for_payment))
        appArgs.push(algosdk.encodeUint64(denominator))
        appArgs.push(algosdk.encodeUint64(numerator))
        const foreignAssets = [asset_for_payment];                

        console.log(`foreignAssets = ${foreignAssets}`)

        const from = multsigaddr;
        const appIndex = appid;
        const callTxn = algosdk.makeApplicationNoOpTxn(
            from,
            suggestedParams,
            appIndex,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );

        // sign transaction
        const signature1 = algosdk.signMultisigTransaction(
            callTxn,
            multiSigOptions,
            accountKey1.private_key
        );
        const signature2 = algosdk.signMultisigTransaction(
            callTxn,
            multiSigOptions,
            accountKey2.private_key
        );
        const stxn = algosdk.mergeMultisigTransactions([
            signature1.blob,
            signature2.blob,
        ]);

        // print transaction data
        const decoded = algosdk.decodeSignedTransaction(stxn);
        console.log(decoded);

        // send the transaction
        logBold('Sending application call transaction.');
        const { txId: callTxnId } = await algoclient
            .sendRawTransaction(stxn)
            .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, callTxnId);
        console.log(completedTx);


        const appInformation = await algoclient.getApplicationByID(appid).do();

        assert.equal(appInformation['params']['global-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['params']['global-state-schema']["num-uint"], 4);
        assert.equal(appInformation['params']['local-state-schema']["num-byte-slice"], 1);
        assert.equal(appInformation['params']['local-state-schema']["num-uint"], 10);

        for (var item of appInformation['params']['global-state']) {
            switch(Buffer.from(item.key, "base64").toString()){
                case 'currency':
                    assert.equal(asset_for_payment, item.value.uint);
                break;
                case 'plat_admin':
                    assert.equal(algosdk.encodeAddress(new Uint8Array(Buffer.from(item.value.bytes, "base64"))), multsigaddr);
                break;
                case 'set_rate_denominator':
                    assert.equal(denominator, item.value.uint);
                break;
                case 'set_rate_numerator':
                    assert.equal(numerator, item.value.uint);
                break;
                default:
                    assert.fail();
            }
        }

    }); 

    it('the lender optin', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        const lender_accountInformation_pre = await algoclient.accountInformation(
            account2
        ).do();

        // opt in to the created application
        const optInTxn = algosdk.makeApplicationOptInTxn(
        account2,
        suggestedParams,
        appid
        );

        // send the transaction
        logBold('Sending application opt in transaction.');
        const signedOptInTxn = optInTxn.signTxn(accountKey2.private_key);
        const { txId: optInTxId } = await algoclient
        .sendRawTransaction(signedOptInTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, optInTxId);       

        const appInformation = await algoclient.accountApplicationInformation(
            account2,
            appid
        ).do();

        assert.equal(appInformation['app-local-state']['schema']["num-byte-slice"], 1);
        assert.equal(appInformation['app-local-state']['schema']["num-uint"], 10);

        const lender_accountInformation_after = await algoclient.accountInformation(
            account2
        ).do();
        console.log('lender amount after: ', lender_accountInformation_after.amount)
        console.log('lender amount before: ', lender_accountInformation_pre.amount)

    }); 


    it('the borrower optin', async () => {

        // get suggested params
        const suggestedParams = await algoclient.getTransactionParams().do();  

        // opt in to the created application
        const optInTxn = algosdk.makeApplicationOptInTxn(
        account3,
        suggestedParams,
        appid
        );

        // send the transaction
        logBold('Sending application opt in transaction.');
        const signedOptInTxn = optInTxn.signTxn(accountKey3.private_key);
        const { txId: optInTxId } = await algoclient
        .sendRawTransaction(signedOptInTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, optInTxId);      
        
        const appInformation = await algoclient.accountApplicationInformation(
            account3,
            appid
        ).do();

        assert.equal(appInformation['app-local-state']['schema']["num-byte-slice"], 1);
        assert.equal(appInformation['app-local-state']['schema']["num-uint"], 10);        
    }); 


    it('offer a nft for lease', async () => {

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent offer");   

        const lender_accountInformation_pre = await algoclient.accountInformation(
            account2
        ).do();
        const app_accountInformation_pre = await algoclient.accountInformation(
            appAddress
        ).do();

        // pay for nft optin of contract
        params.fee = 1000;
        const txn1 = algosdk.makePaymentTxnWithSuggestedParams(account2, appAddress, 100000, undefined, note, params);

        // build an offer
        params.fee = 2000;
        let appArgs = [enc.encode("offer")];
        appArgs.push(algosdk.encodeUint64(asset_for_lease));  // asset for lease
        appArgs.push(algosdk.encodeUint64(60*3600*24));  //time unit
        appArgs.push(algosdk.encodeUint64(10));  //max time units of lease period 
        appArgs.push(algosdk.encodeUint64(1));   //min time units of lease period 
        appArgs.push(algosdk.encodeUint64(2));   // price per unit
        appArgs.push(algosdk.encodeUint64(1));  // if extendable
        const foreignAssets = [asset_for_lease];                      
        const txn2 = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );
        
        // transfer nft to contract
        params.fee = 1000;
        const txn3 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: account2,
            to: appAddress,
            suggestedParams: params,
            amount: 1,
            assetIndex: asset_for_lease,
        });

        // assign group id to transactions
        algosdk.assignGroupID([txn1, txn2, txn3]);

        // sign transactions
        const stxn1 = txn1.signTxn(accountKey2.private_key);
        const stxn2 = txn2.signTxn(accountKey2.private_key);
        const stxn3 = txn3.signTxn(accountKey2.private_key);


        // send transactions (note that the accounts need to be funded for this to work)
        console.log('Sending transactions...');
        const { txId } = await algoclient.sendRawTransaction([stxn1, stxn2, stxn3]).do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, txId);     
        
        const appInformation = await algoclient.accountApplicationInformation(
            account2,
            appid
        ).do();

        assert.equal(appInformation['app-local-state']['schema']["num-byte-slice"], 1);
        assert.equal(appInformation['app-local-state']['schema']["num-uint"], 10);        

        for (var item of appInformation['app-local-state']['key-value']) {
            switch(Buffer.from(item.key, "base64").toString()){
                case 'item_index':
                    assert.equal(asset_for_lease, item.value.uint);
                break;
                case 'is_extendable':
                    assert.equal(1, item.value.uint);
                break;
                case 'max_time_units':
                    assert.equal(10, item.value.uint);
                break;
                case 'min_time_units':
                    assert.equal(1, item.value.uint);
                break;
                case 'time_unit':
                    assert.equal(60*3600*24, item.value.uint);
                break;             
                case 'state':
                    assert.equal(1, item.value.uint);  
                break;
                case 'price_per_unit':
                    assert.equal(2, item.value.uint);  
                break;
                default:
                    assert.fail();
            }
        }

        let assetInformation = await algoclient.accountAssetInformation(
            account2,
            asset_for_lease
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_lease);
        assert.equal(assetInformation['asset-holding']['amount'], 0);

        assetInformation = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_lease
        ).do();

        assert.equal(assetInformation['asset-holding']['asset-id'], asset_for_lease);
        assert.equal(assetInformation['asset-holding']['amount'], 1);        

        const lender_accountInformation_after = await algoclient.accountInformation(
            account2
        ).do();
        const app_accountInformation_after = await algoclient.accountInformation(
            appAddress
        ).do();
        console.log('lender amount after: ', lender_accountInformation_after.amount)
        console.log('lender amount before: ', lender_accountInformation_pre.amount)


        assert.equal(app_accountInformation_after.amount - app_accountInformation_pre.amount, 100000);
        assert.equal(lender_accountInformation_pre.amount - lender_accountInformation_after.amount, 100000+1000+2000+1000);
    }); 
    

    it('change offer', async () => {

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 1000;
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent offer");   

        // build an offer
        let appArgs = [enc.encode("offer")];
        appArgs.push(algosdk.encodeUint64(asset_for_lease));  // asset for lease
        appArgs.push(algosdk.encodeUint64(4));  //time unit
        appArgs.push(algosdk.encodeUint64(30));  //max time units of lease period 
        appArgs.push(algosdk.encodeUint64(1));   //min time units of lease period 
        appArgs.push(algosdk.encodeUint64(5));   // price per unit
        appArgs.push(algosdk.encodeUint64(1));  // if extendable
        const foreignAssets = [asset_for_lease];                      
        const txn = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );

        // send the transaction
        logBold('Sending transaction...');
        const signedTxn = txn.signTxn(accountKey2.private_key);
        const { txId: TxId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, TxId);    
        
        const appInformation = await algoclient.accountApplicationInformation(
            account2,
            appid
        ).do();

        assert.equal(appInformation['app-local-state']['schema']["num-byte-slice"], 1);
        assert.equal(appInformation['app-local-state']['schema']["num-uint"], 10);        

        for (var item of appInformation['app-local-state']['key-value']) {
            switch(Buffer.from(item.key, "base64").toString()){
                case 'item_index':
                    assert.equal(asset_for_lease, item.value.uint);
                break;
                case 'is_extendable':
                    assert.equal(1, item.value.uint);
                break;
                case 'max_time_units':
                    assert.equal(30, item.value.uint);
                break;
                case 'min_time_units':
                    assert.equal(1, item.value.uint);
                break;
                case 'time_unit':
                    assert.equal(4, item.value.uint);
                break;             
                case 'state':
                    assert.equal(1, item.value.uint);  
                break;
                case 'price_per_unit':
                    assert.equal(5, item.value.uint);  
                break;
                default:
                    assert.fail();
            }
        }        

    });     

    it('rent the nft', async () => {
        
        const borrower_assetInformatio_pre = await algoclient.accountAssetInformation(
            account3,
            asset_for_payment
        ).do();
        const app_assetInformatio_pre = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();

        console.log('borrower_assetInformatio_pre: ',borrower_assetInformatio_pre['asset-holding']['amount']);
        console.log('app_assetInformatio_pre: ',app_assetInformatio_pre['asset-holding']['amount']);

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent nft");   

        // build an offer
        params.fee = 1000;
        let appArgs = [enc.encode("rent")];
        appArgs.push(algosdk.encodeUint64(20));  // amount of payments
        const foreignAssets = [asset_for_payment];       
        const accounts = [account2];            
        const txn1 = algosdk.makeApplicationNoOpTxn(
            account3,
            params,
            appid,
            appArgs,
            accounts,
            undefined,
            foreignAssets
        );
        
        // transfer nft to contract
        params.fee = 1000;
        const txn2 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: account3,
            to: appAddress,
            suggestedParams: params,
            amount: 20,
            assetIndex: asset_for_payment,
        });

        // assign group id to transactions
        algosdk.assignGroupID([txn1, txn2]);

        // sign transactions
        const stxn1 = txn1.signTxn(accountKey3.private_key);
        const stxn2 = txn2.signTxn(accountKey3.private_key);

        // send transactions (note that the accounts need to be funded for this to work)
        console.log('Sending transactions...');
        const { txId } = await algoclient.sendRawTransaction([stxn1, stxn2]).do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, txId);  
        
        const borrower_assetInformatio_after = await algoclient.accountAssetInformation(
            account3,
            asset_for_payment
        ).do();
        const app_assetInformatio_after = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();
        console.log('borrower_assetInformatio_after: ',borrower_assetInformatio_after['asset-holding']['amount']);
        console.log('app_assetInformatio_after: ',app_assetInformatio_after['asset-holding']['amount']);

        assert.equal(borrower_assetInformatio_pre['asset-holding']['amount'] - borrower_assetInformatio_after['asset-holding']['amount'], 20);
        assert.equal(app_assetInformatio_after['asset-holding']['amount'] - app_assetInformatio_pre['asset-holding']['amount'], 20);  

    });     


    it('try to recall before lease expiration', async () => {
        
        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 2000;
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent offer");   
   
        // build an offer
        let appArgs = [enc.encode("callback")];
        const foreignAssets = [asset_for_lease];                      
        const txn = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );   

        try 
        {
            // send the transaction
            logBold('Sending transaction...');
            const signedTxn = txn.signTxn(accountKey2.private_key);
            const { txId: TxId } = await algoclient
            .sendRawTransaction(signedTxn)
            .do();

            // wait for confirmation
            await verboseWaitForConfirmation(algoclient, TxId);    
            assert.fail();
        } catch (err) {
            console.log(err);
        }

    });   


    it('try to recall after expiration, but leave rents uncollected', async () => {
        console.log("waiting for 16 seconds ...");
        await sleep(1000*16);

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 2000;
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent offer");   
   
        // build an offer
        let appArgs = [enc.encode("callback")];
        const foreignAssets = [asset_for_lease];                      
        const txn = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );   

        try 
        {
            // send the transaction
            logBold('Sending transaction...');
            const signedTxn = txn.signTxn(accountKey2.private_key);
            const { txId: TxId } = await algoclient
            .sendRawTransaction(signedTxn)
            .do();

            // wait for confirmation
            await verboseWaitForConfirmation(algoclient, TxId);    
            assert.fail();
        } catch (err) {
            console.log(err);
        }

    });  


    it('try to collect rents', async () => {
        
        const lender_assetInformatio_pre = await algoclient.accountAssetInformation(
            account2,
            asset_for_payment
        ).do();
        const app_assetInformatio_pre = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 2000;
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("collect rents");   
   
        // build an offer
        let appArgs = [enc.encode("collect")];
        appArgs.push(algosdk.encodeUint64(18));  
        const foreignAssets = [asset_for_payment];                    
        const txn = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );   

        // send the transaction
        logBold('Sending transaction...');
        const signedTxn = txn.signTxn(accountKey2.private_key);
        const { txId: TxId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, TxId);   
        
        const lender_assetInformatio_after = await algoclient.accountAssetInformation(
            account2,
            asset_for_payment
        ).do();
        const app_assetInformatio_after = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();
        console.log('lender_assetInformatio_after: ',lender_assetInformatio_after['asset-holding']['amount']);
        console.log('app_assetInformatio_after: ',app_assetInformatio_after['asset-holding']['amount']);

        assert.equal(lender_assetInformatio_after['asset-holding']['amount'] - lender_assetInformatio_pre['asset-holding']['amount'], 18);
        assert.equal(app_assetInformatio_pre['asset-holding']['amount'] - app_assetInformatio_after['asset-holding']['amount'], 18);  
        

    });   

    it('try to recall the nft', async () => {
        
        const lender_accountInformation_pre = await algoclient.accountInformation(
            account2
        ).do();
        const app_accountInformation_pre = await algoclient.accountInformation(
            appAddress
        ).do();
        const lender_assetInformation_pre = await algoclient.accountAssetInformation(
            account2,
            asset_for_lease
        ).do();
        const app_assetInformation_pre = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_lease
        ).do();
        assert.equal(app_assetInformation_pre['asset-holding']['amount'], 1);

        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 3000;
        params.flatFee = true; 
        const enc = new TextEncoder();   
        const note = enc.encode("rent offer");   
   
        // build an offer
        let appArgs = [enc.encode("callback")];
        const foreignAssets = [asset_for_lease];                      
        const txn = algosdk.makeApplicationNoOpTxn(
            account2,
            params,
            appid,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );   

        // send the transaction
        logBold('Sending transaction...');
        const signedTxn = txn.signTxn(accountKey2.private_key);
        const { txId: TxId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, TxId);    


        const lender_accountInformation_after = await algoclient.accountInformation(
            account2
        ).do();
        const app_accountInformation_after = await algoclient.accountInformation(
            appAddress
        ).do();

        console.log('lender amount after: ', lender_accountInformation_after.amount)
        console.log('lender amount before: ', lender_accountInformation_pre.amount)
        assert.equal(app_accountInformation_pre.amount - app_accountInformation_after.amount, 100000);
        assert.equal(lender_accountInformation_after.amount - lender_accountInformation_pre.amount, 100000 - 3000);

        const lender_assetInformation_after = await algoclient.accountAssetInformation(
            account2,
            asset_for_lease
        ).do();

        assert.equal(lender_assetInformation_after['asset-holding']['amount'] - lender_assetInformation_pre['asset-holding']['amount'], 1);
    });  

    it('lender closeout', async () => {
        
        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 1000;
        params.flatFee = true; 
   
        const appArgs = [];
        // closeout transaction                   
        const txn = algosdk.makeApplicationCloseOutTxn(
            account2,
            params,
            appid,
            appArgs
        );

        // send the transaction
        logBold('Sending transaction...');
        const signedTxn = txn.signTxn(accountKey2.private_key);
        const { txId: TxId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, TxId);    
    });  

    it('borrower closeout', async () => {
        
        // Construct the transaction
        let params = await algoclient.getTransactionParams().do();
        // console.log(`params.genesisID: \n ${params.genesisID}`);
        // console.log(`params.genesisHash: \n ${params.genesisHash}`);
        // comment out the next two lines to use suggested fee
        params.fee = 1000;
        params.flatFee = true; 
   
        const appArgs = [];
        // closeout transaction                   
        const txn = algosdk.makeApplicationCloseOutTxn(
            account3,
            params,
            appid,
            appArgs
        );

        // send the transaction
        logBold('Sending transaction...');
        const signedTxn = txn.signTxn(accountKey3.private_key);
        const { txId: TxId } = await algoclient
        .sendRawTransaction(signedTxn)
        .do();

        // wait for confirmation
        await verboseWaitForConfirmation(algoclient, TxId);    
    });  

    it('withdraw plat fund', async () => {

        const manager_assetInformatio_pre = await algoclient.accountAssetInformation(
            multsigaddr,
            asset_for_payment
        ).do();
        const app_assetInformatio_pre = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();

        // get suggested params
        let suggestedParams = await algoclient.getTransactionParams().do();  
        suggestedParams.fee = 2000;
        suggestedParams.flatFee = true;        

        // create a multisig account
        const multiSigOptions = {
            version: 1,
            threshold: 2,
            addrs: [account1, account2, account3],
        };

        const enc = new TextEncoder();     
        let appArgs = [enc.encode("withdraw_flat_fund")];
        // appArgs.push(new Uint8Array(asset_for_payment));
        appArgs.push(algosdk.encodeUint64(2))
        const foreignAssets = [asset_for_payment];                

        const from = multsigaddr;
        const appIndex = appid;
        const callTxn = algosdk.makeApplicationNoOpTxn(
            from,
            suggestedParams,
            appIndex,
            appArgs,
            undefined,
            undefined,
            foreignAssets
        );

        // sign transaction
        const signature1 = algosdk.signMultisigTransaction(
            callTxn,
            multiSigOptions,
            accountKey1.private_key
        );
        const signature2 = algosdk.signMultisigTransaction(
            callTxn,
            multiSigOptions,
            accountKey2.private_key
        );
        const stxn = algosdk.mergeMultisigTransactions([
            signature1.blob,
            signature2.blob,
        ]);

        // print transaction data
        const decoded = algosdk.decodeSignedTransaction(stxn);
        console.log(decoded);

        // send the transaction
        logBold('Sending application call transaction.');
        const { txId: callTxnId } = await algoclient
            .sendRawTransaction(stxn)
            .do();

        // wait for confirmation
        const completedTx = await verboseWaitForConfirmation(algoclient, callTxnId);
        console.log(completedTx);


        const manager_assetInformatio_after = await algoclient.accountAssetInformation(
            multsigaddr,
            asset_for_payment
        ).do();
        const app_assetInformatio_after = await algoclient.accountAssetInformation(
            appAddress,
            asset_for_payment
        ).do();

        assert.equal(manager_assetInformatio_after['asset-holding']['amount'] - manager_assetInformatio_pre['asset-holding']['amount'], 2);
        assert.equal(app_assetInformatio_pre['asset-holding']['amount'] - app_assetInformatio_after['asset-holding']['amount'], 2);        
        
    }); 

}); 