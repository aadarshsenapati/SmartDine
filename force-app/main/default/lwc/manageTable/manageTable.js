import { LightningElement, wire } from 'lwc';
import getAllTables from '@salesforce/apex/TableManagerController.getAllTables';
import updateTables from '@salesforce/apex/TableManagerController.updateTables'; 
import createTable from '@salesforce/apex/TableManagerController.createTable';
import deleteTable from '@salesforce/apex/TableManagerController.deleteTable';
import disableTable from '@salesforce/apex/TableManagerController.disableTable';
import enableTable from '@salesforce/apex/TableManagerController.enableTable';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import QR_CODE_IMAGE from '@salesforce/resourceUrl/qrCodeImage';
import { NavigationMixin } from 'lightning/navigation';

const COLUMNS = [
    { label: 'Table #', fieldName: 'Name', type: 'text' },
    { label: 'QR Code', fieldName: 'QRCodeID__c', type: 'text', editable: true },
    { label: 'Occupied', fieldName: 'IsOccupied__c', type: 'boolean', editable: true },
    { label: 'Disabled?', fieldName: 'Is_Disabled__c', type: 'boolean', editable: true},
    {
        type: 'action',
        typeAttributes: { rowActions: { fieldName: 'rowActions' } }
    }
];

export default class ManageTable extends NavigationMixin(LightningElement) {
    columns = COLUMNS;
    tables = [];
    draftValues = [];
    wiredTablesResult;

    // QR Code
    showQRModal = false;
    currentTableId;
    currentTableName;
    qrCodeImage;
    qrCodeUrl;

    @wire(getAllTables)
    wiredTables(result) {
        this.wiredTablesResult = result;
        if (result.data) {
            this.tables = result.data.map(row => {
                let rowActions = [
                    { label: 'Generate QR', name: 'generate_qr' }
                ];

                if (row.Is_Disabled__c) {
                    rowActions.push({ label: 'Enable Table', name: 'enable_table', iconName: 'utility:check' });
                } else {
                    rowActions.push({ label: 'Disable Table', name: 'disable_table', iconName: 'utility:block_visitor' });
                }

                rowActions.push({ label: 'Delete Table', name: 'delete_table', iconName: 'utility:delete' });

                return { ...row, rowActions };
            });
        } else if (result.error) {
            this.showToast('Error', result.error.body.message, 'error');
        }
    }

    handleSave(event) {
        const tablesToUpdate = event.detail.draftValues.map(table => ({
            Id: table.Name,
            QRCodeID__c: table.QRCodeID__c,
            IsOccupied__c: table.IsOccupied__c
        }));

        updateTables({ tables: tablesToUpdate })
            .then(() => {
                this.draftValues = [];
                this.showToast('Success', 'Table(s) updated', 'success');
                return refreshApex(this.wiredTablesResult);
            })
            .catch(error => {
                console.error('Update error:', error);
                this.showToast('Error', error.body?.message || error.message, 'error');
            });
    }

    handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;

        switch (action.name) {
            case 'generate_qr':
                this.generateQRCode(row.Id, row.Name);
                break;
            case 'disable_table':
                this.disableSelectedTable(row.Id);
                break;
            case 'enable_table':
                this.enableSelectedTable(row.Id);
                break;
            case 'delete_table':
                this.deleteSelectedTable(row.Id);
                break;
        }
    }

    deleteSelectedTable(tableId) {
        if (!confirm('Are you sure you want to delete this table?')) return;

        deleteTable({ tableId })
            .then(() => {
                this.showToast('Success', 'Table deleted', 'success');
                return refreshApex(this.wiredTablesResult);
            })
            .catch(error => {
                console.error('Delete error:', error);
                this.showToast('Error', error.body?.message || 'Failed to delete table', 'error');
            });
    }

    disableSelectedTable(tableId) {
        if (!confirm('Disable this table?')) return;

        disableTable({ tableId })
            .then(() => {
                this.showToast('Success', 'Table disabled', 'success');
                return refreshApex(this.wiredTablesResult);
            })
            .catch(error => {
                console.error('Disable error:', error);
                this.showToast('Error', error.body?.message || 'Failed to disable table', 'error');
            });
    }

    enableSelectedTable(tableId) {
        enableTable({ tableId })
            .then(() => {
                this.showToast('Success', 'Table enabled', 'success');
                return refreshApex(this.wiredTablesResult);
            })
            .catch(error => {
                console.error('Enable error:', error);
                this.showToast('Error', error.body?.message || 'Failed to enable table', 'error');
            });
    }

    generateQRCode(tableId, tableName) {
        this.currentTableId = tableId;
        this.currentTableName = tableName;

        this[NavigationMixin.GenerateUrl]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'User_Page'  // ✅ Correct API Name
            },
            state: {
                c__tableId: tableId
            }
        })
        .then((url) => {
            this.qrCodeUrl = "https://orgfarm-eb4f2e5f56-dev-ed.develop.my.site.com/User/s/?c__tableId="+tableId;
            this.qrCodeImage = QR_CODE_IMAGE;
            this.showQRModal = true;
        })
        .catch(error => {
            console.error('Generate QR Error:', error);
            this.showToast('Error', 'Failed to generate QR code link. Check NavigationMixin setup.', 'error');
        });
    }


    closeQRModal() {
        this.showQRModal = false;
    }

    createNewTable() {
        createTable()
            .then(() => {
                this.showToast('Success', 'Table created', 'success');
                return refreshApex(this.wiredTablesResult);
            })
            .catch(error => {
                console.error('Create table error:', error);
                this.showToast('Error', error.body?.message || 'Failed to create table', 'error');
            });
    }

    showToast(title, message, variant) {
        if (typeof message === 'string' && message.includes('$')) {
            message = message.replace('$', '₹');
        }
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
