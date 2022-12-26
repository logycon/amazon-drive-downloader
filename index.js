
import createConnectionPool, { sql } from '@databases/pg';
import axios from 'axios';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const API = 'https://drive.amazonaws.com/drive/v1';
const BEARER_TOKEN = process.env.AMAZON_BEARER_TOKEN;

const headers = {
    'Authorization': `Bearer ${BEARER_TOKEN}`
}

const db = createConnectionPool(
    'postgres://postgres:postgres@localhost:5432/postgres',
);

const endpoint = async () => {
    const res = await axios.get(`${API}/account/endpoint`, { headers: headers })
    return res.data;
}

let totalIndexed = 0;
const indexItems = async (endpoints, startToken) => {
    try {
        const startTokenParam = startToken != undefined ? `startToken=${startToken}`: '';
        const url = `${API}/nodes?${startTokenParam}`;
        const response = await axios.get(url, { headers: headers });

        for (const item of response.data.data) {
            if (['FILE', 'ASSET'].includes(item.kind)) {
                const saveItem = {
                    ...item,
                    contentUrl: `${endpoints.contentUrl}drive/v1/nodes/${item.id}/content`,
                }
                const id = saveItem.id
                try {
                    await db.query(sql`INSERT INTO amazon_drive_items (id, data) VALUES (${id}, ${saveItem}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`);
                } catch (error) {
                    console.log(`Error in ${item.id}: ${error.message}`, item)
                    await db.query(sql`INSERT INTO amazon_drive_items (id, error) VALUES (${id}, ${error.message}) ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error, data = '{}'::jsonb`);
                }
            }
        }

        totalIndexed += response.data.data.length;
        console.log(`Indexed ${totalIndexed} items...`)

        if (response.data.nextToken && response.data.nextToken.length > 0) {
            await indexItems(endpoints, response.data.nextToken);
        }

    } catch (error) {
        console.log(`Error: ${error.message}`)
    }
}

const downloadItem = async (item) => {
    let targetDir = `downloads/${item.kind}`;
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
    }
    targetDir = `${targetDir}/${item.content_type}`;
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
    }

    try {
        const targetFileName = `${targetDir}/${item.id}_${item.name}`;
        const itemResponse = await axios.get(item.content_url, {
            responseType: 'arraybuffer',
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`
            },
        });

        // Write the item data to a file
        fs.writeFileSync(targetFileName, itemResponse.data);
        await db.query(sql`update amazon_drive_items set downloaded_to = ${targetFileName} where id = ${item.id}`);
    } catch (error) {
        console.log(`Error downloading ${item.contenturl}: ${error.message}`);
        fs.appendFileSync('logs/errors.txt', `${item.contentUrl}\n`);
    }
}

const downloadItems = async (kind, endpoint) => {
    const items = await db.query(sql`select * from view_amazon_drive_items where kind = ${kind} and downloaded_to = ''`);
    console.log(`${items.length} to download`);
    let count = 0;
    for (const item of items) {
        await downloadItem(item);
        count ++;
        const progress = (count/items.length) * 100;
        console.log(`${progress} ${count} of ${items.length}`);
    }
}

(async () => {
    const endpoints = await endpoint();
    
    console.log('Indexing....');
    await indexItems(endpoints);
    
    console.log('Downloading ASSETs....');
    await downloadItems('ASSET');
    
    console.log('Downloading FILEs....');
    await downloadItems('FILE');
})();




