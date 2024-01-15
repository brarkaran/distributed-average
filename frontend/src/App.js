import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Row, Col, Card, Form, Button, Table, Modal, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-moment';

function WorkerManagement({ onInitialize, onDeactivate }) {
  const [numWorkers, setNumWorkers] = useState('');

  const handleInitialize = () => {
    onInitialize(numWorkers);
  };

  const handleDeactivate = () => {
    onDeactivate();
  };

  return (
    <Card className="text-center mt-4">
      <Card.Header as="h5">Worker Management</Card.Header>
      <Card.Body>
        <Form inline className="justify-content-center mb-3">
          <Form.Group>
            <Form.Label className="mr-2">Number of Workers</Form.Label>
            <Form.Control
              type="number"
              value={numWorkers}
              onChange={(e) => setNumWorkers(e.target.value)}
            />
          </Form.Group>
          <Button variant="primary" onClick={handleInitialize} className="ml-2">
            Initialize Workers
          </Button>
        </Form>
        <Button variant="danger" onClick={handleDeactivate}>
          Deactivate Workers
        </Button>
      </Card.Body>
    </Card>
  );
}


function App() {
  const [jobs, setJobs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [numberOfFiles, setNumberOfFiles] = useState('');
  const [countPerFile, setCountPerFile] = useState('');
  const [isGeneratingFiles, setIsGeneratingFiles] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobSubmissionStatus, setJobSubmissionStatus] = useState('');
  const [workersData, setWorkersData] = useState({ idle: [], busy: [] });

  const handleModalOpen = () => setShowModal(true);
  const handleModalClose = () => setShowModal(false);

  const handleInitializeWorkers = async (num) => {
    // Call API to initialize workers
    console.log("Initializing workers with count: ", num);
    try {
      const response = await axios.post('https://api.ephemeron.io/workers/initialize', {
        numWorkers: num,
      });
      console.log("Response: ", response);
    } catch (error) {
      console.error('Error fetching workers data:', error);
    }
  };

  const handleDeactivateWorkers = () => {
    // Call API to deactivate workers
    console.log("Deactivating workers");
    try {
      const response = axios.post('https://api.ephemeron.io/workers/deactivate');
      console.log("Response: ", response);
    } catch (error) {
      console.error('Error fetching workers data:', error);
    }
  };

  const fetchWorkersData = async () => {
    try {
      const response = await axios.get('https://api.ephemeron.io/workers');
      const newData = response.data;
      const timestamp = new Date().toISOString();

      const { idleCount, busyCount } = newData.workers.reduce((acc, worker) => {
        acc[worker.status === 'IDLE' ? 'idleCount' : 'busyCount']++;
        return acc;
      }, { idleCount: 0, busyCount: 0 });

      setWorkersData(prevData => {
        const newIdle = [...prevData.idle, { time: timestamp, count: idleCount }].slice(-50);
        const newBusy = [...prevData.busy, { time: timestamp, count: busyCount }].slice(-50);

        return {
          idle: newIdle,
          busy: newBusy,
        };
      });
    } catch (error) {
      console.error('Error fetching workers data:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await axios.get('https://api.ephemeron.io/jobs');
      setJobs(response.data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchWorkersData, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 1000);
    return () => clearInterval(interval);
  }, []);

  const chartOptions = {
    animation: {
      duration: 0, // general animation time
    },
    hover: {
      animationDuration: 0, // duration of animations when hovering an item
    },
    responsiveAnimationDuration: 0, // animation duration after a resize
    elements: {
      line: {
        tension: 0.5 // disables bezier curves
      },
      point: {
        radius: 0 // hide points
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'second',
          displayFormats: {
            minute: 'hh:mm:ss a'
          },
          tooltipFormat: 'hh:mm:ss a'
        }
      }
    },
  };
  const chartData = {
    labels: workersData.idle.map(dataPoint => dataPoint.time),
    datasets: [
      {
        label: 'Idle Workers',
        data: workersData.idle.map(dataPoint => dataPoint.count),
        backgroundColor: "#c2f970",
        borderColor: "#c2f970"
      },
      {
        label: 'Busy Workers',
        data: workersData.busy.map(dataPoint => dataPoint.count),
        backgroundColor: "#af4154",
        borderColor: "#af4154"
      },
    ],
  };



  const handleSubmit = async (event) => {
    event.preventDefault();
    handleModalClose();

    setIsGeneratingFiles(true);
    setJobSubmissionStatus('');

    try {
      const files = await axios.post('https://api.ephemeron.io/files/generate', {
        numFiles: numberOfFiles,
        numPerFile: countPerFile,
      });
      setIsGeneratingFiles(false);
      setIsSubmittingJob(true);

      await axios.post('https://api.ephemeron.io/jobs/schedule', {
        input: files.data.files,
      });
      setIsSubmittingJob(false);
      setJobSubmissionStatus('Job Submitted Successfully');

      await fetchJobs();
    } catch (error) {
      console.error('Error:', error);
      setIsGeneratingFiles(false);
      setIsSubmittingJob(false);
      setJobSubmissionStatus('Failed to submit job');
    }
  };


  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div>
      <div className="text-right mt-3 mr-3">
        <a href="https://queue.ephemeron.io/" target="_blank" rel="noopener noreferrer">
          RabbitMQ Queue Management
        </a>
      </div>
      <Container className="mt-5">
        <WorkerManagement
          onInitialize={handleInitializeWorkers}
          onDeactivate={handleDeactivateWorkers}
        />
        <Row className="mt-4">
          <Col style={{ maxWidth: '600px', maxHeight: '400px', margin: '0 auto' }}>
            <Line data={chartData} options={chartOptions} />
          </Col>
        </Row>
      </Container>

      <Container className="mt-5">
        <Row>
          <Col md={{ span: 6, offset: 3 }}>
            <Card className="text-center">
              <Card.Header as="h5">Job Submission</Card.Header>
              <Card.Body>
                <Button variant="primary" onClick={handleModalOpen}>
                  Submit Job
                </Button>

                <JobSubmissionModal
                  show={showModal}
                  handleClose={handleModalClose}
                  handleNumberChange={(e) => setNumberOfFiles(e.target.value)}
                  handleCountChange={(e) => setCountPerFile(e.target.value)}
                  handleSubmit={handleSubmit}
                />
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <Row className="mt-4">
          <Col>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Total Duration (seconds)</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{job.status}</td>
                    <td>{formatDate(job.startTime)}</td>
                    <td>{job.endTime ? formatDate(job.endTime) : ""}</td>
                    <td>{job.duration ? job.duration / 1000 : ""}</td>
                    <td>{job.output ? job.output[0] : ""}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Col>
        </Row>

        <SpinningStatusModal
          isGenerating={isGeneratingFiles}
          isSubmitting={isSubmittingJob}
        />
      </Container>
    </div>
  );
}

export default App;

const JobSubmissionModal = ({ show, handleClose, handleNumberChange, handleCountChange, handleSubmit, numberOfFiles, countPerFile }) => (
  <Modal show={show} onHide={handleClose}>
    <Modal.Header closeButton>
      <Modal.Title>Submit Job</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <Form onSubmit={handleSubmit}>
        <Form.Group>
          <Form.Label>Number of Files</Form.Label>
          <Form.Control type="number" value={numberOfFiles} onChange={handleNumberChange} />
        </Form.Group>
        <Form.Group>
          <Form.Label>Count per File</Form.Label>
          <Form.Control type="number" value={countPerFile} onChange={handleCountChange} />
        </Form.Group>
        <Button variant="primary" type="submit">
          Submit
        </Button>
      </Form>
    </Modal.Body>
  </Modal>
);

const SpinningStatusModal = ({ isGenerating, isSubmitting }) => {
  let message = '';
  if (isGenerating) {
    message = "Generating files, please wait...";
  } else if (isSubmitting) {
    message = "Submitting job, please wait...";
  }

  return (
    <Modal show={isGenerating || isSubmitting} onHide={() => { }}>
      <Modal.Body>
        <div className="text-center">
          <Spinner animation="border" />
          <p className="mt-3">{message}</p>
        </div>
      </Modal.Body>
    </Modal>
  );
};
