import HciSocket from 'hci-socket';
import NodeBleHost from 'ble-host';

const COMPARISON_FAILED = 0xC;

const BleManager = NodeBleHost.BleManager;
const AdvertisingDataBuilder = NodeBleHost.AdvertisingDataBuilder;
const HciErrors = NodeBleHost.HciErrors;
const AttErrors = NodeBleHost.AttErrors;

enum Connection {
    CONNECTED = "CONNECTED",
    PAIRING = "PAIRING",
    ADVERTISING = "ADVERTISING"
}

export default class BluetoothManager {
    private manager: any = null;
    private deviceName: string = null;
    private passcodeHandler: Function = null;
    private btConnection = null;

    public connectionStatus: Connection = null

    private initAdvData(manager, services) {
        const advDataBuffer = new AdvertisingDataBuilder()
            .addFlags(['leGeneralDiscoverableMode', 'brEdrNotSupported'])
            .addLocalName(/*isComplete*/ true, this.deviceName)
            .add128BitServiceUUIDs(/*isComplete*/ true, services.map((service) => service.uuid))
            .build();
        manager.setAdvertisingData(advDataBuffer);
    }

    private newPairingHandler(status, conn) {
        if (status != HciErrors.SUCCESS) {
            // Advertising could not be started for some controller-specific reason, try again after 10 seconds
            setTimeout(this.startAdvertising, 10000);
            return;
        }

        this.connectionStatus = Connection.PAIRING;
        this.btConnection = conn;
        conn.on('disconnect', () => {
            this.btConnection = null; this.startAdvertising()
        }); // restart advertising after disconnect

        console.log('Connection established!');
        console.log('Security: ', conn.smp.currentEncryptionLevel);

        const IOCapabilities = NodeBleHost.IOCapabilities;
        const AssociationModels = NodeBleHost.AssociationModels;
        const SmpErrors = NodeBleHost.SmpErrors;

        conn.smp.sendSecurityRequest(/*bond*/ true, /*mitm*/ true, /*sc*/ true, /*keypress*/ false);

        // Without this event handler the I/O capabilities will be no input, no output
        conn.smp.on('pairingRequest', function (req, callback) {
            callback({ ioCap: IOCapabilities.DISPLAY_YES_NO, bondingFlags: 1, mitm: true });
        });

        conn.smp.on('passkeyExchange', (associationModel, passcode, callback) => {
            console.log('Security in passkeyExchange: ', conn.smp.currentEncryptionLevel);

            if (associationModel == AssociationModels.NUMERIC_COMPARISON) {
                console.log(`NUMERIC_COMPARISON got code: ${passcode}:`);
                this.passcodeHandler(passcode)
                    .then(() => {
                        callback();
                    })
                    .catch(() => {
                        conn.smp.sendPairingFailed(COMPARISON_FAILED);
                    });
            }
        });

        conn.smp.on('pairingComplete', (resultObject) => {
            this.connectionStatus = Connection.CONNECTED;
            console.log('The pairing process is now complete!');
            console.log('MITM protection: ' + conn.smp.currentEncryptionLevel.mitm);
            console.log('LE Secure Connections used: ' + conn.smp.currentEncryptionLevel.sc);
            // Put logic here, e.g. read a protected characteristic
        });

        conn.smp.on('pairingFailed', function (reason, isErrorFromRemote) {
            console.log('Pairing failed with reason ' + SmpErrors.toString(reason));
        });

    }

    public init(deviceName: string, services: object[], passcodeHandler: (pinCode: string) => Promise<any>,) {
        this.deviceName = deviceName;
        this.passcodeHandler = passcodeHandler;

        var transport = new HciSocket(); // connects to the first hci device on the computer, for example hci0
        var options = {
            // optional properties go here
        };

        const initPromise = new Promise((resolve, reject) => {
            BleManager.create(transport, options, (err, manager) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.manager = manager;
                manager.gattDb.addServices(services);
                this.initAdvData(manager, services);
                manager.gattDb.setDeviceName(deviceName);

                resolve("SUCCESS");
            });
        });

        return initPromise;
    }

    public startAdvertising() {
        this.connectionStatus = Connection.ADVERTISING;
        this.manager.startAdvertising({ /*options*/ }, this.newPairingHandler.bind(this));
        console.log("Started advertising")
    }

    public stopAdvertising() {
        // TODO
    }

    public disconnect() {
        this.btConnection && this.btConnection.disconnect(); // This will also start readvertising
        this.btConnection = null;
    }

}

