#!/usr/bin/env node

import * as os from 'node:os';

import { ApiClient } from './api/client.js';
import { DEFAULT_API_URL } from './config/constants.js';
import { loadEnvConfig } from './config/env.js';
import { createLogger } from './logger/index.js';
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_RECONNECT_GRACE_MS } from './map/constants.js';
import { MapReader } from './map/reader.js';
import { createMapSocket } from './map/socket.js';
import { MapStore } from './map/store.js';
import { MapSync } from './map/sync.js';
import { createServer } from './server.js';
import { AllowanceService } from './services/allowance.service.js';
import { AppConfigService } from './services/app-config.service.js';
import { AuthService } from './services/auth.service.js';
import { BalanceService } from './services/balance.service.js';
import { BuildService } from './services/build.service.js';
import { CraftService } from './services/craft.service.js';
import { MiningService } from './services/mining.service.js';
import { MintService } from './services/mint.service.js';
import { RevealService } from './services/reveal.service.js';
import { SwapService } from './services/swap.service.js';
import { TradeService } from './services/trade.service.js';
import { TransportService } from './services/transport.service.js';
import { WithdrawService } from './services/withdraw.service.js';
import { SessionManager } from './session/manager.js';
import { SessionStorage } from './session/storage.js';
import type { AppContext } from './types.js';
import { errorMessage } from './utils/error.utils.js';
import { createWalletProvider } from './wallet/index.js';

async function main(): Promise<void> {
    const config = loadEnvConfig();
    const logger = createLogger();
    logger.info('starting MCP server', { walletMode: config.WALLET_MODE });

    const storage = new SessionStorage(os.homedir(), logger.child('session:storage'));
    const session = new SessionManager({
        storage,
        walletMode: config.WALLET_MODE,
        logger: logger.child('session'),
    });
    session.initialize();
    logger.info('session initialized', { status: session.getStatus() });

    const wallet = createWalletProvider({ config, session, logger });
    logger.info('wallet provider created', { ready: wallet.isReady() });

    const api = new ApiClient({
        baseUrl: config.API_URL ?? DEFAULT_API_URL,
        session,
        logger: logger.child('api'),
    });

    const auth = new AuthService({ session, api, wallet, logger: logger.child('auth') });
    api.setAuthenticator(auth);

    const appConfig = new AppConfigService({ api, network: config.NETWORK, logger: logger.child('config') });
    const allowance = new AllowanceService({ wallet, logger: logger.child('allowance') });
    const reveal = new RevealService({ api, wallet, appConfig, allowance, logger: logger.child('reveal') });
    const build = new BuildService({ api, wallet, appConfig, allowance, logger: logger.child('build') });
    const craft = new CraftService({ api, wallet, appConfig, allowance, logger: logger.child('craft') });
    const mining = new MiningService({ api, logger: logger.child('mining') });
    const transport = new TransportService({ api, wallet, appConfig, allowance, logger: logger.child('transport') });
    const trade = new TradeService({ api, wallet, appConfig, allowance, logger: logger.child('trade') });
    const swap = new SwapService({ wallet, appConfig, allowance, logger: logger.child('swap') });
    const mint = new MintService({ wallet, appConfig, logger: logger.child('mint') });
    const balance = new BalanceService({ wallet, appConfig, logger: logger.child('balance') });
    const withdraw = new WithdrawService({ api, wallet, appConfig, allowance, logger: logger.child('withdraw') });

    const store = new MapStore();
    const mapSync = new MapSync({
        store,
        api,
        socketFactory: createMapSocket,
        logger: logger.child('map:sync'),
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        reconnectGraceMs: DEFAULT_RECONNECT_GRACE_MS,
    });
    const mapReader = new MapReader({ store, status: mapSync });

    const context: AppContext = {
        config,
        session,
        wallet,
        api,
        auth,
        appConfig,
        reveal,
        build,
        craft,
        mining,
        transport,
        trade,
        swap,
        mint,
        balance,
        withdraw,
        mapSync,
        mapReader,
        logger,
    };

    // Connect the transport first so the handshake isn't blocked, then load the map in the
    // background — a slow or unreachable map source must not delay or break startup.
    await createServer(context);
    logger.info('MCP server listening on stdio');

    mapSync.start();

    const shutdown = (): void => {
        mapSync.stop();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
    createLogger().error(`fatal: ${errorMessage(error)}`);
    process.exit(1);
});
