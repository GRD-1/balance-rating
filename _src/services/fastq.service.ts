import fastq from 'fastq';
import config from 'config';
import type { queue, done } from 'fastq';
import { Data, Account, QueueTaskArgs, DownloadQueueFiller } from '../models/max-balance.model';
import scheduleDownloads from '../utils/schedule-downloads';
import setTimer from '../utils/timer';
import getMaxAccount from '../utils/get-max-account';
import { EtherscanService } from './etherscan.service';
const etherscan = new EtherscanService();

export class FastqService {
  private downloadQueue: queue<QueueTaskArgs, fastq.done>;
  private processQueue: queue<QueueTaskArgs, fastq.done>;
  readonly sessionKey: number;
  private addressBalances: Account;
  private maxAccount: Account = { undefined };
  private amountOfTransactions = 0;

  constructor(public blocksAmount: number, public lastBlock: string) {
    this.sessionKey = Date.now();
  }

  async getMaxChangedBalance(): Promise<Data> {
    try {
      await this.connectToServer();
      const result = await new Promise((resolve) => {
        (async (): Promise<void> => {
          const errMsg = await setTimer(this.blocksAmount * config.WAITING_TIME_FOR_BLOCK);
          resolve(errMsg);
        })();
        (async (): Promise<void> => {
          const loadingTime = await this.downloadData();
          const processTime = await this.processData();
          resolve({
            addressBalances: this.addressBalances,
            maxAccount: this.maxAccount,
            amountOfTransactions: this.amountOfTransactions,
            processTime,
            loadingTime,
          });
        })();
      });
      this.cleanQueue();
      return result;
    } catch (err) {
      return { error: err.message };
    }
  }

  async connectToServer(): Promise<void | Error> {
    return null;
  }

  downloadData(): Promise<number> {
    const startTime = Date.now();
    this.downloadQueue = fastq((args: QueueTaskArgs, callback: done) => this.downloadQueueWorker(args, callback), 1);
    this.processQueue = fastq((args: QueueTaskArgs, callback: done) => this.processQueueWorker(args, callback), 1);
    this.processQueue.pause();

    const queueFiller: DownloadQueueFiller = (args: QueueTaskArgs) => {
      const terminateTask = args.taskNumber >= this.blocksAmount;
      const task = { ...args, terminateTask, sessionKey: this.sessionKey };
      this.downloadQueue.push(task);
    };
    scheduleDownloads(queueFiller, this.lastBlock, this.blocksAmount);

    return new Promise((resolve) => {
      this.downloadQueue.drain = (): void => {
        resolve((Date.now() - startTime) / 1000);
      };
    });
  }

  async downloadQueueWorker(args: QueueTaskArgs, callback: done): Promise<void> {
    try {
      if (config.LOG_BENCHMARKS === true) console.log(`\ndownload queue iteration ${args.taskNumber}`);
      const block = await etherscan.getBlock(args.blockNumberHex);
      const dataProcessTask = { ...args, content: block };
      await this.processQueue.push(dataProcessTask);
      const err = 'status' in block || 'error' in block ? Error(JSON.stringify(block.result)) : null;
      callback(err);
    } catch (e) {
      console.error('\ndownloadBlocks Error!', e);
      callback(e);
    }
  }

  async processData(): Promise<number> {
    const startTime = Date.now();
    await new Promise((resolve) => {
      this.processQueue.drain = (): void => {
        resolve(null);
      };
      this.processQueue.resume();
    });
    return (Date.now() - startTime) / 1000;
  }

  async processQueueWorker(args: QueueTaskArgs, callback: done): Promise<void> {
    if (config.LOG_BENCHMARKS === true) console.log(`\nprocess queue iteration ${args.taskNumber}`);
    console.log('\nargs.content.result:', args.content.result);
    const transactions = args.content?.result ? args.content.result.transactions : undefined;
    if (transactions) {
      this.addressBalances = transactions.reduce((accum, item) => {
        this.amountOfTransactions++;
        const val = Number(item.value);
        accum[item.to] = (accum[item.to] || 0) + val;
        accum[item.from] = (accum[item.from] || 0) - val;
        this.maxAccount = getMaxAccount(
          { [item.to]: accum[item.to] },
          { [item.from]: accum[item.from] },
          this.maxAccount,
        );
        return accum;
      }, {});
    }
    callback(null);
  }

  async cleanQueue(): Promise<void> {
    await this.downloadQueue.kill();
    await this.processQueue.kill();
  }
}
