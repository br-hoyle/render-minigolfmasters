import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Courses() {
  useEffect(() => {
    document.title = 'Courses | Mini Golf Masters'
  }, [])

  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/courses/')
      .then(setCourses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display font-black text-3xl text-gray-900">Courses</h1>

      {courses.length === 0 ? (
        <p className="text-gray-400 text-sm">No courses yet.</p>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <Link
              key={course.course_id}
              to={`/courses/${course.course_id}`}
              className="block bg-white rounded-xl border border-[#E0E1E5] p-5 hover:border-[#135D40] hover:shadow-sm transition-all"
            >
              <h2 className="font-display font-bold text-xl text-gray-900">{course.name}</h2>
              {course.address && (
                <p className="text-sm text-gray-500 mt-1">{course.address}</p>
              )}
              {course.description && (
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{course.description}</p>
              )}
              <span className="inline-block mt-3 text-xs font-bold text-[#135D40]">
                View Details &amp; Analytics →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
