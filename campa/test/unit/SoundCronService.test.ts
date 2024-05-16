import sinon from 'sinon';
import { expect } from 'chai';
import { SoundCronService } from "../../src/SoundCronService";
import { MariaDbSoundCronRepo } from "../../src/SoundCronRepo";
import { HttpWarehouseClient } from "../../src/HttpWarehouseClient";
import { BullMqJobQueue } from "../../src/BullMqJobQueue";
import { logger } from "../../src/logging";

let soundCronService: SoundCronService;
let soundCronRepoMock: sinon.SinonStubbedInstance<MariaDbSoundCronRepo>;
let warehouseClientMock: sinon.SinonStubbedInstance<HttpWarehouseClient>;
let jobQueueMock: sinon.SinonStubbedInstance<BullMqJobQueue>;
logger.transports.forEach((t) => (t.silent = true));

describe('SoundCronService', () => {
  describe('addCron', () => {

    beforeEach(() => {
      soundCronRepoMock = sinon.createStubInstance(MariaDbSoundCronRepo);
      warehouseClientMock = sinon.createStubInstance(HttpWarehouseClient);
      jobQueueMock = sinon.createStubInstance(BullMqJobQueue);
      soundCronService = new SoundCronService(soundCronRepoMock, warehouseClientMock, jobQueueMock, logger);
    });

    it('should indicate that the cron string is not well formed', async () => {
      const result = await soundCronService.addCron('serverId', {
        name: 'name',
        cron: 'invalid-cron',
        timezone: 'timezone',
        audio: 'audio',
        mute: false,
        excludeChannels: []
      });
      const expected = {
        success: false,
        reason: 'InvalidCron'
      };
      expect(result).to.eql(expected);
    });

    const table = [
      { name: 'soundCronRepo', modification: () => soundCronRepoMock.addCron.rejects(new Error('error')) },
      { name: 'warehouseClient', modification: () => warehouseClientMock.remove.rejects(new Error('error')) },
      { name: 'jobQueue', modification: () => jobQueueMock.remove.rejects(new Error('error')) }
    ];
  
    const validCron = {
      name: 'name',
      cron: '0 0 * * *',
      timezone: 'timezone',
      audio: 'audio',
      mute: false,
      excludeChannels: []
    }

    for (const { name, modification } of table) {
      it(`should rollback everything if an error occurs when adding to ${name}`, async () => {
        modification();
        try {
          await soundCronService.addCron('serverId', validCron);
        } catch (err) {
          expect(warehouseClientMock.remove.calledOnce).to.be.true;
          expect(soundCronRepoMock.removeCron.calledOnce).to.be.true;
          expect(jobQueueMock.remove.calledOnce).to.be.true;
        }
      });

      it(`should throw an error if any error occurs with ${name}`, async () => {
        modification();
        try {
          await soundCronService.addCron('serverId', validCron);
        } catch (err) {
          expect(err).to.be.an('error');
        }
      });
    }
    
    it('should return success if everything goes well', async () => {
      const result = await soundCronService.addCron('serverId', validCron);
      const expected = {
        success: true
      };
      expect(result).to.eql(expected);
    });
  });
});
