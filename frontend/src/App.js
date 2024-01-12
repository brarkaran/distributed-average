import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Row, Col, Card, Form, Button, Table, Modal } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css'; // Custom CSS file


function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [numberOfFiles, setNumberOfFiles] = useState('');
  const [countPerFile, setCountPerFile] = useState('');
  const handleModalOpen = () => setShowModal(true);
  const handleModalClose = () => setShowModal(false);


  useEffect(() => {
    // Fetch jobs initially and at regular intervals
    const fetchJobs = async () => {
      try {
        const response = await axios.get('http://localhost:8000/jobs');
        setJobs(response.data);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      }
    };

    fetchJobs(); // Fetch immediately on component mount
    const interval = setInterval(fetchJobs, 6000); // Fetch every 60 seconds

    return () => clearInterval(interval); // Clear interval on component unmount
  }, []);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      alert('Please select a file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await axios.post('your-backend-upload-endpoint', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Optionally, fetch jobs again to update the list
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
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
                handleFileChange={handleFileChange}
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
                <th>Update Time</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.status}</td>
                  <td>{formatDate(job.createdAt)}</td>
                  <td>{formatDate(job.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
    </Container>
  );
}

export default App;


const JobSubmissionModal = ({ show, handleClose, handleFileChange, handleNumberChange, handleCountChange, handleSubmit, numberOfFiles, countPerFile }) => (
  <Modal show={show} onHide={handleClose}>
    <Modal.Header closeButton>
      <Modal.Title>Submit Job</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <Form>
        <Form.Group>
          <Form.Label>Upload File</Form.Label>
          <Form.Control type="file" onChange={handleFileChange} />
        </Form.Group>
        <Form.Group>
          <Form.Label>Number of Files</Form.Label>
          <Form.Control type="number" value={numberOfFiles} onChange={handleNumberChange} />
        </Form.Group>
        <Form.Group>
          <Form.Label>Count per File</Form.Label>
          <Form.Control type="number" value={countPerFile} onChange={handleCountChange} />
        </Form.Group>
        <Button variant="primary" type="submit" onClick={handleSubmit}>
          Submit
        </Button>
      </Form>
    </Modal.Body>
  </Modal>
);