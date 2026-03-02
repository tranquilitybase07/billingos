import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

describe('AppController integration', () => {
  let appController: AppController;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = moduleFixture.get(AppController);
  });

  it('/ (GET) returns hello world', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });

  it('binds controller to root path', () => {
    expect([undefined, '', '/']).toContain(Reflect.getMetadata(PATH_METADATA, AppController));
  });
});
