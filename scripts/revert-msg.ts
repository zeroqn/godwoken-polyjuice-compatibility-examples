import { ContractFactory, Contract, providers } from "ethers";

import { deployer, initGWKAccountIfNeeded, networkSuffix } from "../common";

import { TransactionSubmitter } from "../TransactionSubmitter";

import RevertMsg from "../artifacts/contracts/RevertMsg.sol/RevertMsg.json";

interface IRevertMsg extends Contract {
    test_revert(msg: string): Promise<providers.TransactionResponse>;
}

const deployerAddress = deployer.address;

async function main() {
    console.log("Deployer address:", deployerAddress);
    await initGWKAccountIfNeeded(deployerAddress);

    const transactionSubmitter = await TransactionSubmitter.newWithHistory(
        `create2${networkSuffix ? `-${networkSuffix}` : ""}.json`,
        Boolean(process.env.IGNORE_HISTORY),
    );

    let receipt = await transactionSubmitter.submitAndWait(
        `Deploy Create2`,
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
    console.log(`    revert msg address:`, revertMsgAddress);

    const revertMsg = new Contract(
        revertMsgAddress,
        RevertMsg.abi,
        deployer,
    ) as IRevertMsg;

    receipt = await transactionSubmitter.submitAndWait(
        'test revert message',
        () => revertMsg.test_revert("hello world")
    );
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.log("err", err);
        process.exit(1);
    });
