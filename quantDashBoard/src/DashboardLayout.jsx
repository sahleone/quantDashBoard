import React from 'react';
import Nav from './navbar';
import Chart from './chart';
import TabPanel from './TabPanel';



function DashboardLayout({ children }) {

return (
    <div className="dashboard-layout">
        <Nav/>
        <Chart/>
        <TabPanel/>

</div>

);
}

export default DashboardLayout;