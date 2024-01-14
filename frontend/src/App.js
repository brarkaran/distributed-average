import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Row, Col, Card, Form, Button, Table, Modal, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css'; // Custom CSS file

function App() {
  const [jobs, setJobs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [numberOfFiles, setNumberOfFiles] = useState('');
  const [countPerFile, setCountPerFile] = useState('');
  const [isGeneratingFiles, setIsGeneratingFiles] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobSubmissionStatus, setJobSubmissionStatus] = useState('');
  const handleModalOpen = () => setShowModal(true);
  const handleModalClose = () => setShowModal(false);

  // Refactored fetchJobs function to call independently
  const fetchJobs = async () => {
    try {
      const response = await axios.get('https://api.ephemeron.io/job');
      setJobs(response.data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  useEffect(() => {
    fetchJobs(); // Fetch immediately on component mount
    const interval = setInterval(fetchJobs, 60000); // Fetch every 60 seconds
    return () => clearInterval(interval); // Clear interval on component unmount
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    handleModalClose(); // Close the job submission modal

    setIsGeneratingFiles(true);
    setJobSubmissionStatus('');

    try {
      const files = await axios.post('https://api.ephemeron.io/files', {
        numFiles: numberOfFiles,
        numPerFile: countPerFile,
      });
      setIsGeneratingFiles(false);
      setIsSubmittingJob(true);

      await axios.post('https://api.ephemeron.io/job', {
        input: files.data.files,
      });
      setIsSubmittingJob(false);
      setJobSubmissionStatus('Job Submitted Successfully');

      // Refresh the jobs data table
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
      {/* Right-aligned link to Queue Management */}
      <div className="text-right mt-3 mr-3">
        <a href="https://queue.ephemeron.io/" target="_blank" rel="noopener noreferrer">
          RabbitMQ Queue Management
        </a>
      </div>
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
