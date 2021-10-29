import { ContractFactory, Contract, providers, BigNumberish } from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import { rpc, deployer, isGodwoken, initGWKAccountIfNeeded, networkSuffix } from "../common";

import { TransactionSubmitter } from "../TransactionSubmitter";

import RevertMsg from "../artifacts/contracts/RevertMsg.sol/RevertMsg.json";

import { RequestManager, HTTPTransport, Client } from "@open-rpc/client-js";
const transport = new HTTPTransport("http://localhost:8024");
const client = new Client(new RequestManager([transport]));

interface IRevertMsg extends Contract {
    test_revert(msg: string): Promise<providers.TransactionResponse>;
    store(newValue: BigNumberish): Promise<providers.TransactionResponse>;
}

const deployerAddress = deployer.address;
const waitFor = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

async function waitForErrReceipt(txHash: string): Promise<any> {
    let count_down = 20;
    while (count_down > 0) {
        await waitFor(5000);
        const receipt = await client.request({ method: "eth_getTransactionReceipt", params: [txHash] });
        if (receipt != null) {
            return receipt;
        }

        count_down = count_down - 1;
        if (count_down === 0) {
            throw new Error('unable to fetch error transaction receipt');
        }
    }
}

async function main() {
    console.log("Deployer address:", deployerAddress);
    await initGWKAccountIfNeeded(deployerAddress);

    let deployerRecipientAddress = deployerAddress;
    if (isGodwoken) {
        const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
        deployerRecipientAddress =
            await godwoker.getShortAddressByAllTypeEthAddress(deployerAddress);
        console.log("Deployer godwoken address:", deployerRecipientAddress);
    }

    const transactionSubmitter = await TransactionSubmitter.newWithHistory(
        `create2${networkSuffix ? `-${networkSuffix}` : ""}.json`,
        Boolean(process.env.IGNORE_HISTORY),
    );

    let receipt = await transactionSubmitter.submitAndWait(
        `Deploy RevertMsg`,
        () => {
            const implementationFactory = new ContractFactory(
                RevertMsg.abi,
                RevertMsg.bytecode,
                deployer,
            );
            const tx = implementationFactory.getDeployTransaction();
            return deployer.sendTransaction(tx);
        },
    );

    const revertMsgAddress = receipt.contractAddress;
    console.log(`revert msg address:`, revertMsgAddress);

    const revertMsg = new Contract(
        revertMsgAddress,
        RevertMsg.abi,
        deployer,
    ) as IRevertMsg;

    try {
        await transactionSubmitter.submitAndWait(
            'test execute',
            () => revertMsg.test_revert('test message')
        );
    } catch (error) {
        console.log(error);
        if (error.message.indexOf('test message') == -1) {
            throw new Error('unable to get revert message');
        }
    }

    console.log('Running transaction: test submit');
    let tipBlockNumber = await rpc.getBlockNumber();
    let res = await revertMsg.store(tipBlockNumber);
    let errReceipt = await waitForErrReceipt(res.hash);
    const failedReason = errReceipt.failed_reason.message;
    if (failedReason.toString('utf8').indexOf('no no no no') == -1) {
        throw new Error('unexpected store revert message');
    }

    console.log('test clear expired block error tx receipt');
    tipBlockNumber = await rpc.getBlockNumber();
    let expiredAfterMemBlockNumber = BigInt(errReceipt.blockNumber) + BigInt(4);
    console.log(`current tip block ${tipBlockNumber}, wait until mem block ${expiredAfterMemBlockNumber}`);
    while (tipBlockNumber + 1 <= expiredAfterMemBlockNumber) {
        await waitFor(7000);
        tipBlockNumber = await rpc.getBlockNumber();
        console.log(`tip block number ${tipBlockNumber}`);
    }

    // Make another error receipt to trigger expired block clearing
    res = await revertMsg.store(tipBlockNumber);
    await waitForErrReceipt(res.hash)
    console.log(`try fetch error receipt for ${errReceipt.transactionHash}`);
    let tryReceipt = await client.request({ method: "eth_getTransactionReceipt", params: [errReceipt.transactionHash] });
    if (tryReceipt != null) {
        if (tryReceipt.blockNumber != errReceipt.blockNumber) {
            throw new Error(`error receipt saved in db changed, from block ${errReceipt.blockNumber} to block ${tryReceipt.blockNumber}`);
        }
        throw new Error("expired error receipt isn't cleared");
    }
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.log("err", err);
        process.exit(1);
    });
