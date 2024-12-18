const downloadCruxDomains = async () => {
    const date = new Date();
    date.setDate(date.getDate() - 45);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    const url = `https://raw.githubusercontent.com/crissyfield/crux-dumps/main/${year}/${month}/50000000.txt.xz`;
    
    const response = await fetch(url);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const fs = require('fs');
    const path = require('path');
    
    fs.writeFileSync(
        path.join(process.cwd(), 'urls/crux-domains.txt.xz'),
        buffer
    );

    return true;
};

export default downloadCruxDomains;
