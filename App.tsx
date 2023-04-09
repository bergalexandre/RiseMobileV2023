import { Button, StyleSheet, PermissionsAndroid, View, Text } from 'react-native';

import React from 'react';
import * as Location from 'expo-location';
import { BleError, BleManager, Characteristic, Device, Service, Subscription as BleSubscription } from 'react-native-ble-plx';
import mqtt, { MqttClient } from "precompiled-mqtt";
import { Buffer } from "buffer";
import BluetoothPicker from './bluetoothPicker';
import DalyBms from './dalybmsBle';

type GPSReaderProps = {
  GpsLocation: Location.LocationObject
}

function GpsReader(props: GPSReaderProps) {  
    return (
      <View>
        <Text style={styles.bigtext}>GPS lattitude: {props.GpsLocation.coords.latitude}</Text>
        <Text style={styles.bigtext}>GPS longitude: {props.GpsLocation.coords.longitude}</Text>
        <Text style={styles.bigtext}>GPS altitude: {props.GpsLocation.coords.altitude}</Text>
      </View>
        
    );
}

type STM32ReaderProps = {
  message: string
}

function Stm32Reader(props: STM32ReaderProps) {  
  return (
      <Text style={styles.bigtext}>
              Message du STM32: {props.message}      
      </Text>
  );
}

const GPSReadOptions: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  mayShowUserSettingsDialog: false,
  timeInterval: undefined,
  distanceInterval: undefined
}

export type HomeScreenProps = {
}

// Les valeurs qui actualise l'interface
type RiseMobileScreenState = {
  test: number,
  gpsLocation: Location.LocationObject,
  bluetoothErrorFlag: boolean
  isMonitoringStarted: boolean,
  isBluetoothAvailable: boolean,
  IsLocationAvailable: boolean,
  debugStm32Message: string
}


type GPSCoordinate = {
  latitude: number,
  longitude: number,
  timestamp: number
};
export default class RiseMobileScreen extends React.Component<HomeScreenProps, RiseMobileScreenState>
{
    private stm32Device ?: Device = undefined; 
    private bleManager: BleManager = new BleManager();
    private bleStateWatcher ?: BleSubscription;
    private mqttClient: MqttClient|undefined;
    private hm10Monitor ?: BleSubscription;
    private bluetoothPickerRef: React.RefObject<BluetoothPicker>;

    constructor(props:HomeScreenProps) {
        super(props);
        this.state = { 
          test: 1, 
          gpsLocation: {coords: { latitude: 69, longitude: 69, altitude: 69}, timestamp: 69} as unknown as Location.LocationObject,
          bluetoothErrorFlag: false,
          isMonitoringStarted: false,
          isBluetoothAvailable: false,
          IsLocationAvailable: false,
          debugStm32Message: ""
        };
        this.bluetoothPickerRef = React.createRef<BluetoothPicker>();
    }

    Increment() {
        this.setState({test: (this.state.test+1)})
    }

    componentDidMount() {
      Location.requestForegroundPermissionsAsync().then(
        (value) => {
          this.setState({IsLocationAvailable: true});
          this.bleStateWatcher = this.bleManager.onStateChange((state) => {
            if (state === 'PoweredOn') {
                requestBLEPermissions().then(() => {
                  this.setState({isBluetoothAvailable: true});
                }).catch((error) => {
                  throw new error(`Ne possède pas les permissions pour le BLE: ${error}`);
                });
            } else {
                this.setState({isBluetoothAvailable: false});
                console.log(`Nouvel état de l'antenne BLE = ${state}`);
            }
          }, true);
        }).catch((msg) => { 
          throw new Error(`Ne possède pas les permissions d'accèss pour la localisation GPS: ${msg}` );
        });

        const requestBLEPermissions = async () => {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
          await PermissionsAndroid.requestMultiple([ PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT])
        }

        
        
      this.init_mqtt_client();
    }
    
    componentWillUnmount() {
      this.setState({isMonitoringStarted: false});
      this.bleStateWatcher?.remove();

    }

    render() {
      return (
          <View style={styles.container}>
            <Text style={styles.title}>Rise Mobile</Text>
            <View style={styles.separator}/>
            <Button
                onPress={() => this.monitorRiseVehicule()}
                title={this.state.isMonitoringStarted ? "Stop": "Start"} >
            </Button>
            {
              this.state.debugStm32Message == "" ?
              <BluetoothPicker ref={this.bluetoothPickerRef} />
              :
              <View style={styles.separatorFiller}>
                <GpsReader GpsLocation={this.state.gpsLocation}></GpsReader>
                <Stm32Reader message={this.state.debugStm32Message}></Stm32Reader>
                <Text style={styles.bigtext}>Bluetooth: {this.state.isBluetoothAvailable? "Actif": "Inactif"}</Text>
                <Text style={styles.bigtext}>Localisation: {this.state.IsLocationAvailable? "Actif": "Inactif"}</Text>
                <Text style={styles.bigtext}>Bluetooth Status: {this.state.bluetoothErrorFlag? "Erreurs détectée": "Pas d'erreur"}</Text>
              </View>
            }
          </View>
      );
      /*return (
        <DalyBms bleManager={this.bleManager}></DalyBms>
      )*/
  }

    private async monitorRiseVehicule(): Promise<void> {
      try {
        if(this.state.isMonitoringStarted == false) {
          this.setState({isMonitoringStarted: true})
          if(this.state.isBluetoothAvailable) {
            this.scan();
            this.stm32Device = await this.bluetoothPickerRef.current?.WaitForDevice();
            this.bleManager.stopDeviceScan();
            this.stm32Device = await this.stm32Device?.connect();
            this.stm32Device = await this.stm32Device?.discoverAllServicesAndCharacteristics();
            let stm32SerialCharacteristic = await this.findSerialCharacteristicInDevice();
            this.observeSTM32Data(stm32SerialCharacteristic);
          }
          if(this.state.IsLocationAvailable) {
            this.observeGpsLocation();
          }
        } else {
          this.setState({isMonitoringStarted: false})
          if(this.state.isBluetoothAvailable) {
            this.hm10Monitor?.remove();
            await this.stm32Device?.cancelConnection();

            this.bluetoothPickerRef.current?.ClearDeviceList();
            this.setState({debugStm32Message: ""});
          }
        }
      } catch (error) {
        if(error instanceof BleError) {
          this.setState({bluetoothErrorFlag: true});
          console.error("Erreur de connection");
          console.error(error);
        } else {
          // rethrow si on ne la connait pas
          //throwAsyncError(error)
        }
      }
    }

    private async findSerialCharacteristicInDevice(): Promise<Characteristic> {
      const stm32SerialServiceShortUUID: string = "ffe0";
      const stm32SerialCharacteristicShortUUID: string = "ffe1";
      let services: Service[] | undefined = await this.stm32Device?.services();
      let stm32SerialService = services?.find((service) => service.uuid.includes(stm32SerialServiceShortUUID));
      let characteristics = await stm32SerialService?.characteristics();
      let stm32SerialCharacteristic = characteristics?.find(characteristic => characteristic.uuid.includes(stm32SerialCharacteristicShortUUID));
      
      if(stm32SerialCharacteristic === undefined) {
        throw new Error(`Caractéristique pas trouvé dans la liste des services ${services}`);
      }
      return stm32SerialCharacteristic;

    }

    private init_mqtt_client(): void {
      const URL = "mqtt://test.mosquitto.org:8080";
      this.mqttClient = mqtt.connect(URL);
    }

    private observeGpsLocation(): void {
      let locationRequestOver: boolean = true;
      let timer = setInterval(() => {
        if(locationRequestOver == true) {
          locationRequestOver = false;
          Location.getCurrentPositionAsync(GPSReadOptions)
            .then(location => {
              this.setState({gpsLocation: location}) 
              this.sendGPSLocation(location);
            })
            .catch(reason => console.log(reason))
            .finally(() => {
              locationRequestOver = true;
              if(this.state.isMonitoringStarted === false) {
                clearInterval(timer);
              }
              console.log(`Completed observation of GPS location`)
            })
        }
      }, 1000);
    }

    private observeSTM32Data(serialCharacteristic: Characteristic): void {
      let reception_buffer: Array<Buffer> = [];
        this.hm10Monitor = serialCharacteristic.monitor((error, characteristic) => {
          if(error != undefined) {
            console.error(error);
          } else {
            let received_data: string = characteristic?.value == undefined ? "Aucun message": Buffer.from(characteristic?.value, "base64").toString();
            
            if(received_data.endsWith("end")) {
              let data_buffer = characteristic?.value == undefined ? Buffer.from(""): Buffer.from(characteristic?.value.slice(0, -3), "base64");
              reception_buffer.push(data_buffer);
              
              let message = Buffer.concat(reception_buffer);
              this.setState({debugStm32Message: message.toString("hex")});
              this.sendBluetoothData(message);

              reception_buffer = [];
            } else if(received_data == "Aucun message") {
            } else {
              let data_buffer = characteristic?.value == undefined ? Buffer.from(""): Buffer.from(characteristic?.value, "base64");
              reception_buffer.push(data_buffer);
            }
          }
      });
    }

    private scan(): void {
      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if(error) {
          throw error;
        }
        if(device) {
          this.bluetoothPickerRef.current?.AddDevice(device);
        }
      })
    }

    private sendBluetoothData(bleData: Buffer){
      this.mqttClient?.publish(
        'Rise-ble-Data', 
        bleData, 
        { qos: 0, retain: false }, 
        (error) => {
          if (error) {
            console.error(error)
          }
        }
      )
    }

    private sendGPSLocation(gpsLocation: Location.LocationObject){

      let gpsCoordinate: GPSCoordinate = {
        latitude: gpsLocation.coords.latitude,
        longitude: gpsLocation.coords.longitude,
        timestamp: gpsLocation.timestamp
      };

      let message_encoded = JSON.stringify(gpsCoordinate);

      this.mqttClient?.publish('Rise-GPS-Position', message_encoded, { qos: 0, retain: false }, function (error) {
        if (error) {
          console.log(error)
        } else {
          console.log('Published')
        }
      })  
    }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  separatorFiller: {
    marginVertical: 30,
    height: 1,
    width: '80%',
    flexGrow: 1,
    alignItems: "flex-start"
  },
  button: {
    fontSize: 24,
    color: "#2e6ddf",
  },
  bigtext: {
    fontSize: 18,
  }
});
