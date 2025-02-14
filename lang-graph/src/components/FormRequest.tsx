export const FormRequest = ({ fields }: { fields: string[] }) => {
  return (
    <div>
      {fields.map((field: string) => (
        <div key={field}>
          <label htmlFor={field}>{field}</label>{" "}
          <input id={field} type="string" />
        </div>
      ))}
    </div>
  );
};
