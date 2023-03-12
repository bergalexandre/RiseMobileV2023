import React from 'react';
import { View, StyleSheet, Button, Text, TextInput } from 'react-native';
import { BleError, Characteristic, Device, DeviceId, Service, Subscription as BleSubscription } from 'react-native-ble-plx';
import WheelPicker from 'react-native-wheely';
import BluetoothPicker from './bluetoothPicker';

export enum ConnectionStatus {
    Connected,
    Connecting,
    NotConnected
}

type DalyBmsState = {
    soc: string;
    connectionStatus: ConnectionStatus;
    error: string;
    dalyResponse: string;
    isMonitoringStarted: boolean,
    serviceIndex: string,
    characteristicUuid: string
    socCommand: string
}

export type DalyBmsProps = {
}

class DalyBmsError extends Error {}

export default class DalyBms extends React.Component<DalyBmsProps, DalyBmsState>
{
    private resolvePromise: ((device: Device) => void) | null = null;
    private dalyBms: Device|undefined;
    private readonly NoDevice: DeviceId = "No device";
    private timer: NodeJS.Timeout|undefined;
    private bluetoothPickerRef: React.RefObject<BluetoothPicker>;

    constructor(props:DalyBmsProps) {
        super(props);
        this.state = {
            soc: "0",
            connectionStatus: ConnectionStatus.NotConnected,
            error: "",
            dalyResponse: "",
            isMonitoringStarted: true,
            serviceIndex: "0",
            characteristicUuid: "15",
            socCommand: "90"
        };
        this.bluetoothPickerRef = React.createRef<BluetoothPicker>();
    }

    private async monitorDalyBmsAsync(): Promise<void> {
        this.dalyBms = await this.bluetoothPickerRef.current?.WaitForDevice();
        try {
            this.dalyBms = await this.dalyBms?.connect({timeout: 5000});
        } catch (error: any) {
            console.error(error);
            throw new DalyBmsError("Cannot connect to daly BMS");
        }
        
        this.dalyBms = await this.dalyBms?.discoverAllServicesAndCharacteristics();
        
        let services: Service[] | undefined = await this.dalyBms?.services();
        services?.forEach(async (service, unused1, unused2) => {
            let characteristics = await service.characteristics();
            characteristics.forEach((characteristic, unused3, unused4) => {
                console.log(`service: ${service.uuid} has characteristic ${characteristic}`);
            });
        });

        if(services == null || services == undefined) {
            throw new DalyBmsError("No services found");
        }

        let sub: BleSubscription;
        if(Number(this.state.serviceIndex) < services?.length) {
            // les réponses?
            sub = services[Number(this.state.serviceIndex)].monitorCharacteristic("17", this.monitorDaly)
            // Connection?
            await services[Number(this.state.serviceIndex)].writeCharacteristicWithoutResponse("48","");

            // soc ??
            while(this.state.isMonitoringStarted == true) {
                await services[Number(this.state.serviceIndex)]
                .writeCharacteristicWithoutResponse(
                    this.state.characteristicUuid,
                    this.state.socCommand
                );
                await setTimeout(() => undefined, 1000);
            }
            
        }
        //this.dalyBms?.writeCharacteristicWithoutResponseForService("48")
        
    }

    private monitorDaly(dalyError: BleError|null, characteristic: Characteristic|null): void {
        if(dalyError) {
            console.error(dalyError);
            this.setState({error: dalyError.message})
            return;
        }

        if(characteristic && characteristic?.value) {
            let received_data: string = Buffer.from(characteristic.value, "base64").toString("hex");
            this.setState({dalyResponse: received_data});

            if(characteristic.value.length == 13) {
                characteristic.value
                let soc = Buffer.from(characteristic.value.slice(4), "base64").toString();
                this.setState({soc: soc})
            }
        }

    }

    private monitorDalyBms(): void {
        if(this.state.isMonitoringStarted == false) {
            this.setState({isMonitoringStarted: true});
            this.monitorDalyBmsAsync()
                .then()
                .catch( (errorReason) =>
                {
                    if(errorReason instanceof DalyBmsError) {
                        this.setState({error:errorReason.message})
                    }
                    else {
                        throw errorReason;
                    }
                });
        } else {
            this.setState({isMonitoringStarted: false});
        }
    }

    private handleServiceIndexChange(text: string) {
        this.setState({serviceIndex: text})
    }

    private handleCharacteristicChange(text: string) {
        this.setState({characteristicUuid: text})
    }

    private handleCommandChange(text: string) {
        this.setState({socCommand: text})
    }

    render() {
        return (
            <View style={styles.container}>
                <Text style={styles.bigtext}> 
                    Connection status: {ConnectionStatus[this.state.connectionStatus]}
                </Text>
                <BluetoothPicker ref={this.bluetoothPickerRef} />
                { this.state.connectionStatus == ConnectionStatus.Connected &&
                    <View>
                        <Text style={styles.bigtext}> 
                            Daly data: {this.state.dalyResponse}
                        </Text>
                        <Text style={styles.bigtext}>
                            Daly soc: {this.state.soc}
                        </Text>
                        <Text style={styles.bigtext}>
                            Daly error: {this.state.error}
                        </Text>
                    </View>
                }
                    
                <View style={styles.containerRow}>
                    <Text style={styles.bigtext}>service</Text>
                    <TextInput 
                        style={styles.bigtext} 
                        editable={true}
                        multiline={false}
                        onChangeText={this.handleServiceIndexChange}/>
                </View>

                <View style={styles.containerRow}>
                    <Text style={styles.bigtext}>characteristic</Text>
                    <TextInput 
                        style={styles.bigtext} 
                        editable={true}
                        multiline={false}
                        onChangeText={this.handleCharacteristicChange}/>
                </View>

                <View style={styles.containerRow}>
                    <Text style={styles.bigtext}>command</Text>
                    <TextInput 
                        style={styles.bigtext} 
                        editable={true}
                        multiline={false}
                        onChangeText={this.handleCommandChange}/>
                </View>
                
                <Button
                    onPress={this.monitorDalyBms()}
                    title={this.state.isMonitoringStarted ? "Stop": "Start"} >
                </Button>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      },
    containerRow: {
      flex: 1,
      flexDirection: 'row',
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
    button: {
      fontSize: 24,
      color: "#2e6ddf",
      flex:1
    },
    bigtext: {
      fontSize: 18,
    },
    WheelPicker: {
        flex: 4
    }
  });
  